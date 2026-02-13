import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {copyObject, keyMod, keyPath, mergeDeep, sortNestedObjectKeys} from '@garage44/common/lib/utils.ts'
import {Glob} from 'bun'
import fs from 'fs-extra'
import {watch} from 'node:fs'
import path from 'node:path'

import type {I18n, WorkspaceConfig, WorkspaceDescription} from '../src/types.ts'

import {logger} from '../service.ts'
import {I18N_PATH_SYMBOL} from './i18n.ts'
import {lintWorkspace} from './lint.ts'

export class Workspace {
    private wsManager?: WebSocketServerManager

    config: WorkspaceConfig = {
        languages: {
            // default source language for new workspaces
            source: 'eng-gbr',
            target: [],
        },
        source_file: '',
        sync: {
            // oxlint-disable-next-line no-template-curly-in-string
            dir: '${workspaceFolder}/src/**/*.{ts,tsx}',
            enabled: false,
            suggestions: true,
        },
        workspace_id: '',
    }

    // Add history tracking properties
    private i18nHistory: I18n[] = []

    private i18nHistoryPointer = -1

    private maxHistoryLength = 50

    // Limit history size to prevent memory issues
    private isHistoryOperation = false

    // Flag to prevent recursive history additions
    private watchers: Array<{close(): void}> = []

    // Add transaction tracking with smarter time-based grouping
    private pendingChanges = false

    private batchUpdateInProgress = false

    private operationTimestamp = 0

    private operationTimeout: ReturnType<typeof setTimeout> | null = null

    private OPERATION_GROUPING_TIME = 50

    // Optionally add a throttle mechanism to prevent excessive broadcasts
    private lastBroadcastTime = 0

    private readonly BROADCAST_THROTTLE_TIME = 2000

    // Change i18n to be a private property with a proxied getter/setter
    private _i18n: I18n = {} as I18n

    private _addHistoryTimeout: ReturnType<typeof setTimeout> | null = null

    // ms to consider related operations as a single action

    // Add a proxy handler for tracking object changes
    private createDeepProxy<T extends Record<string, unknown>>(obj: T, onChange: () => void): T {
        return new Proxy(obj, {
            deleteProperty: (target, prop) => {
                if (prop in target && !this.isHistoryOperation) {
                    delete (target as Record<string | symbol, unknown>)[prop]
                    this.pendingChanges = true
                    this.trackOperation(onChange)
                }
                return true
            },
            get: (target, prop) => {
                const value = (target as Record<string | symbol, unknown>)[prop]
                // Only proxy objects, not primitive values
                if (value && typeof value === 'object' && !this.isHistoryOperation) {
                    return this.createDeepProxy(value as Record<string, unknown>, onChange)
                }
                return value
            },
            set: (target, prop, value) => {
                const targetRecord = target as Record<string | symbol, unknown>
                const oldValue = targetRecord[prop]
                targetRecord[prop] = value

                // If this is a real change and not part of a history operation
                if (oldValue !== value && !this.isHistoryOperation) {
                    // Mark that we have changes pending
                    this.pendingChanges = true

                    // Start or extend the current operation grouping
                    this.trackOperation(onChange)
                }

                return true
            },
        })
    }

    // Track operations that happen close together as a single action
    private trackOperation(onChange: () => void): void {
        // If we're in a batch update, don't trigger onChange yet
        if (this.batchUpdateInProgress) {
            return
        }

        const now = Date.now()

        // Clear any pending operation timeout
        if (this.operationTimeout) {
            clearTimeout(this.operationTimeout)
        }

        // If this is the first change or it's been a while since the last change
        if (this.operationTimestamp === 0 || now - this.operationTimestamp > this.OPERATION_GROUPING_TIME) {
            /*
             * This is either the first change in a new operation,
             * or it's been long enough that this is a separate operation
             */

            // If we had pending changes from a previous operation, commit those first
            if (this.pendingChanges && this.operationTimestamp !== 0) {
                onChange()
            }

            // Start tracking a new operation
            this.operationTimestamp = now
        }

        // Schedule the completion of this operation after the grouping time
        this.operationTimeout = setTimeout(() => {
            if (this.pendingChanges) {
                onChange()
                this.pendingChanges = false
            }
            this.operationTimestamp = 0
            this.operationTimeout = null
        }, this.OPERATION_GROUPING_TIME)
    }

    // Public getter/setter for i18n that uses the proxy
    get i18n(): I18n {
        return this._i18n
    }

    set i18n(newI18n: I18n) {
        // When setting directly, add to history if not from history operation
        if (!this.isHistoryOperation && Object.keys(this._i18n).length > 0) {
            this.addToHistory(copyObject(this._i18n))
        }

        /*
         * Attach path symbols to translation objects (needed when i18n is set via WebSocket)
         * This ensures paths are available even after serialization/deserialization
         * Path format: i18n.path.to.translation
         */
        keyMod(newI18n, (_srcRef, _id, refPath) => {
            const sourceRef = keyPath(newI18n, refPath)
            if (typeof sourceRef === 'object' && sourceRef !== null && 'source' in sourceRef && refPath.length > 0) {
                const pathString = `i18n.${refPath.join('.')}`
                ;(sourceRef as Record<string | symbol, unknown>)[I18N_PATH_SYMBOL] = pathString
            }
        })

        // Create a deep proxy with the new i18n object
        this._i18n = this.createDeepProxy(
            // Make a deep copy to ensure we're starting with fresh objects
            copyObject(newI18n),
            () => {
                /*
                 * This callback is triggered for any change in the i18n structure
                 * We make a complete copy of the entire _i18n object for the history
                 */
                this.addToHistory(copyObject(this._i18n))
            },
        )
    }

    async init(description: WorkspaceDescription, isService = true, wsManager?: WebSocketServerManager) {
        this.wsManager = wsManager
        this.config.source_file = description.source_file
        const configExists = await fs.pathExists(this.config.source_file)

        if (!configExists) {
            // The workspace_id is provided when creating a new workspace
            this.config.workspace_id = description.workspace_id

            logger.info(
                `[workspace-${this.config.workspace_id}] no workspace config found yet; creating ${this.config.source_file}...`,
            )
            await fs.writeFile(
                this.config.source_file,
                JSON.stringify(
                    sortNestedObjectKeys({
                        config: this.config,
                        i18n: {},
                    }),
                    null,
                    4,
                ),
                'utf8',
            )
        }

        const workspaceData = await this.load()
        this.config.workspace_id = workspaceData.config.workspace_id

        mergeDeep(this.config as unknown as Record<string, unknown>, workspaceData.config as unknown as Record<string, unknown>)
        // This will now trigger our custom setter
        this.i18n = workspaceData.i18n

        // After loading the i18n data, broadcast it to any connected clients
        this.broadcastI18nState()

        if (isService && this.config.sync.enabled) {
            await this.watch()
        }
    }

    async load() {
        const loadedSettings = JSON.parse(await fs.readFile(this.config.source_file, 'utf8'))
        const i18n = loadedSettings.i18n

        // Augment with state keys and attach path symbols
        keyMod(i18n, (_srcRef, _id, refPath) => {
            const key = refPath.at(-1)
            const sourceRef = keyPath(i18n, refPath)

            if (typeof sourceRef === 'object' && sourceRef !== null) {
                const sourceRefData = sourceRef as Record<string, unknown>
                // The _id field is a copy of the key, used to buffer a key rename.
                sourceRefData._id = key || 'root'
                sourceRefData._collapsed = !!key

                /*
                 * Attach path symbol for type-safe translation references
                 * Only attach to translation objects (those with 'source' property)
                 * Path format: i18n.path.to.translation
                 */
                if ('source' in sourceRef && refPath.length > 0) {
                    const pathString = `i18n.${refPath.join('.')}`
                    ;(sourceRef as Record<string | symbol, unknown>)[I18N_PATH_SYMBOL] = pathString
                }
            }
        })

        // Initialize history with the loaded i18n
        this.i18nHistory = [copyObject(i18n)]
        this.i18nHistoryPointer = 0

        return loadedSettings
    }

    async save() {
        const i18n = copyObject(this.i18n)
        const config = copyObject(this.config)
        delete config.source_file

        keyMod(i18n, (_srcRef, _id, refPath) => {
            const sourceRef = keyPath(i18n, refPath)
            if (typeof sourceRef === 'object') {
                // Soft translation tags shall not pass
                if ('source' in sourceRef && '_soft' in sourceRef) {
                    const parentRef = keyPath(i18n, refPath.slice(0, -1))
                    const sourceRefData = sourceRef as {_id?: string}
                    if (parentRef && typeof parentRef === 'object' && sourceRefData._id) {
                        delete (parentRef as Record<string, unknown>)[sourceRefData._id]
                    }
                }

                // Strip all temporary state keys, before saving.
                const sourceRefData = sourceRef as Record<string, unknown> & {
                    _collapsed?: unknown
                    _id?: unknown
                    _redundant?: unknown
                    target?: {_collapsed?: unknown}
                }
                delete sourceRefData._id
                delete sourceRefData._collapsed
                if ('target' in sourceRefData && sourceRefData.target && typeof sourceRefData.target === 'object') {
                    delete (sourceRefData.target as Record<string, unknown>)._collapsed
                }
                delete sourceRefData._redundant
            }
        })

        await fs.writeFile(
            this.config.source_file,
            JSON.stringify(
                sortNestedObjectKeys({
                    config: this.config,
                    i18n,
                }),
                null,
                4,
            ),
            'utf8',
        )
    }

    async unwatch() {
        logger.info(`[workspace-${this.config.workspace_id}] unwatch workspace`)
        for (const watcher of this.watchers) {
            watcher.close()
        }
        this.watchers = []
    }

    async watch() {
        // oxlint-disable-next-line no-template-curly-in-string
        const scan_target = this.config.sync.dir.replace('${workspaceFolder}', path.dirname(this.config.source_file))
        logger.info(`[workspace-${this.config.workspace_id}] watch ${scan_target}`)

        // Extract base directory and pattern for Bun's Glob
        const firstGlobChar = scan_target.search(/[*?{[]/)
        const baseDir = firstGlobChar === -1 ? scan_target : scan_target.slice(0, scan_target.lastIndexOf('/', firstGlobChar))
        const pattern = firstGlobChar === -1 ? '**/*' : scan_target.slice(baseDir.length + 1)

        const glob = new Glob(pattern)
        const files = Array.from(glob.scanSync(baseDir)).map((f) => path.join(baseDir, f))

        logger.info(`[workspace-${this.config.workspace_id}] watching ${files.length} files`)

        // Create watchers for each file
        for (const file of files) {
            try {
                const watcher = watch(file, async (eventType, filename) => {
                    logger.debug(`[workspace-${this.config.workspace_id}] file changed: ${filename} (${eventType})`)
                    await this.applyLinting('sync')
                })
                this.watchers.push(watcher)
            } catch (error) {
                logger.warn(`[workspace-${this.config.workspace_id}] failed to watch file ${file}: ${error}`)
            }
        }

        await this.applyLinting('sync')
    }

    // Apply linting results without affecting history
    async applyLinting(mode: 'sync' | 'lint'): Promise<void> {
        // Store current history operation state
        const previousHistoryState = this.isHistoryOperation

        // Set history operation flag to prevent recording linting as history
        this.isHistoryOperation = true

        try {
            // Apply the linting
            await lintWorkspace(this, mode)

            // Broadcast the updated state but don't add to history
            this.broadcastI18nState()
        } finally {
            // Restore previous history operation state
            this.isHistoryOperation = previousHistoryState
        }
    }

    // Update the addToHistory method to remove linting
    addToHistory(newI18n: I18n): void {
        // Cancel any pending history updates
        if (this._addHistoryTimeout) {
            clearTimeout(this._addHistoryTimeout)
        }

        this._addHistoryTimeout = setTimeout(async () => {
            const fullStateCopy = copyObject(newI18n)

            // If we're not at the end of the history, remove everything after current point
            if (this.i18nHistoryPointer < this.i18nHistory.length - 1) {
                this.i18nHistory = this.i18nHistory.slice(0, this.i18nHistoryPointer + 1)
            }

            // Skip adding if the state hasn't actually changed
            const lastState = this.i18nHistory[this.i18nHistoryPointer]
            if (lastState && JSON.stringify(lastState) === JSON.stringify(fullStateCopy)) {
                this._addHistoryTimeout = null
                return
            }

            // Add new state to history
            this.i18nHistory.push(fullStateCopy)

            // Limit history size
            if (this.i18nHistory.length > this.maxHistoryLength) {
                this.i18nHistory.shift()
            } else {
                this.i18nHistoryPointer++
            }

            // After adding to history, apply linting and broadcast the state
            await this.applyLinting('sync')

            this._addHistoryTimeout = null
            // Quick timeout just to ensure we're not in the middle of an operation
        }, 20)
    }

    undo(): boolean {
        if (this.i18nHistoryPointer > 0) {
            this.i18nHistoryPointer--

            // Set flag to prevent recursive history tracking during undo/redo
            this.isHistoryOperation = true
            this._i18n = this.createDeepProxy(copyObject(this.i18nHistory[this.i18nHistoryPointer]), () =>
                this.addToHistory(copyObject(this._i18n)),
            )
            this.isHistoryOperation = false

            // Apply linting to the restored state without adding to history
            setTimeout(() => this.applyLinting('sync'), 0)

            // Broadcast the new state after undo
            this.broadcastI18nState()

            return true
        }
        return false
    }

    redo(): boolean {
        if (this.i18nHistoryPointer < this.i18nHistory.length - 1) {
            this.i18nHistoryPointer++

            // Set flag to prevent recursive history tracking during undo/redo
            this.isHistoryOperation = true
            this._i18n = this.createDeepProxy(copyObject(this.i18nHistory[this.i18nHistoryPointer]), () =>
                this.addToHistory(copyObject(this._i18n)),
            )
            this.isHistoryOperation = false

            // Apply linting to the restored state without adding to history
            setTimeout(() => this.applyLinting('sync'), 0)

            // Broadcast the new state after redo
            this.broadcastI18nState()

            return true
        }
        return false
    }

    broadcastI18nState(): void {
        // Create a clean copy while preserving UI state properties
        const cleanI18n = copyObject(this.i18n)

        /*
         * We only need to remove properties that shouldn't be sent
         * but need to keep _id, _collapsed and other UI state properties
         */
        keyMod(cleanI18n, (_srcRef, _id, refPath) => {
            const sourceRef = keyPath(cleanI18n, refPath)
            if (typeof sourceRef === 'object') {
                /*
                 * Only remove properties that shouldn't be sent to clients
                 * but keep all UI-relevant properties
                 */
                /*
                 * Example: if you have any internal server-only properties, remove them here
                 * delete sourceRef._serverOnlyProp
                 */
            }
        })

        // Broadcast the i18n state to all clients
        if (this.wsManager) {
            this.wsManager.broadcast('/i18n/state', {
                history_size: this.i18nHistory.length,
                i18n: cleanI18n,
                timestamp: Date.now(),
                workspace_id: this.config.workspace_id,
            })
        }
    }

    // Throttled version to use in place of direct calls for frequent operations
    throttledBroadcastI18nState(): void {
        const now = Date.now()
        if (now - this.lastBroadcastTime > this.BROADCAST_THROTTLE_TIME) {
            this.broadcastI18nState()
            this.lastBroadcastTime = now
        }
    }
}
