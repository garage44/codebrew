import {enola, logger, workspaces} from '../service.ts'
import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {config} from '../lib/config.ts'
import fs from 'fs/promises'
import path from 'node:path'
import {homedir} from 'node:os'

import {syncLanguage} from '../lib/sync.ts'

/**
 * Get the browse root directory using ~/.expressio/workspaces convention
 * Following the same pattern as avatar storage (~/.{appName}/avatars)
 */
function getBrowseRoot(): string {
    return path.join(homedir(), '.expressio', 'workspaces')
}

/**
 * Ensure the browse root directory exists, creating it if missing
 */
async function ensureBrowseRootExists(): Promise<void> {
    const browseRoot = getBrowseRoot()
    try {
        // Check if the directory already exists and is a directory
        const stats = await fs.stat(browseRoot)
        if (!stats.isDirectory()) {
            throw new Error(`Path exists but is not a directory: ${browseRoot}`)
        }
    } catch(error: unknown) {
        // If error is because path doesn't exist, create it
        const nodeError = error as NodeJS.ErrnoException
        if (nodeError.code === 'ENOENT') {
            // Check parent directory first
            const parentDir = path.dirname(browseRoot)
            try {
                const parentStats = await fs.stat(parentDir)
                if (!parentStats.isDirectory()) {
                    throw new Error(`Parent path exists but is not a directory: ${parentDir}. Cannot create ${browseRoot}`)
                }
            } catch(parentError: unknown) {
                const parentNodeError = parentError as NodeJS.ErrnoException
                if (parentNodeError.code === 'ENOENT') {
                    // Parent doesn't exist, recursive mkdir will create it
                } else {
                    throw new Error(`Cannot create browse root: ${parentNodeError.message}`)
                }
            }
            // Create the directory (recursive will create parent if needed)
            await fs.mkdir(browseRoot, {recursive: true})
            logger.info(`[api] Created browse root directory: ${browseRoot}`)
        } else {
            // Other error (e.g., ENOTDIR - parent is a file)
            const nodeError = error as NodeJS.ErrnoException
            throw new Error(`Cannot create browse root directory: ${nodeError.message}`)
        }
    }
}

/**
 * Validate that a path is within the browse root directory
 * Returns the normalized absolute path if valid, throws error if outside root
 */
function validateBrowsePath(requestedPath: string | null | undefined): string {
    const browseRoot = getBrowseRoot()
    const resolvedRoot = path.resolve(browseRoot)

    // Default to browse root if no path provided
    const reqPath = requestedPath || browseRoot
    const absPath = path.isAbsolute(reqPath) ? reqPath : path.resolve(browseRoot, reqPath)
    const resolvedPath = path.resolve(absPath)

    /*
     * Check if the resolved path is within the browse root
     * Ensure the resolved path starts with the resolved root
     */
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
        throw new Error(`Path is outside allowed browse root: ${resolvedPath}`)
    }

    return resolvedPath
}

export function registerWorkspacesWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // WebSocket API routes (unchanged) - these are for real-time features
    const api = wsManager.api
    api.get('/api/workspaces/browse', async(context, request) => {
        // Ensure browse root exists
        try {
            await ensureBrowseRootExists()
        } catch(error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.error(`[api] Failed to ensure browse root exists: ${errorMessage}`)
            throw new Error(
                `Cannot initialize browse root: ${errorMessage}. Please check that ~/.expressio is a directory, not a file.`,
            )
        }

        // Validate and get the path to browse
        let absPath: string
        try {
            absPath = validateBrowsePath((request.data as {path?: string})?.path)
        } catch(error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.error(`[api] Invalid browse path: ${errorMessage}`)
            throw new Error(`Access denied: ${errorMessage}`)
        }

        const browseRoot = getBrowseRoot()
        const resolvedRoot = path.resolve(browseRoot)

        // List directories
        let entries = []
        try {
            const dirents = await fs.readdir(absPath, {withFileTypes: true})
            entries = await Promise.all(dirents.filter((d) => d.isDirectory()).map((dirent) => {
                const dirPath = path.join(absPath, dirent.name)
                // Validate that child directories are also within root
                try {
                    validateBrowsePath(dirPath)
                } catch {
                    // Skip directories outside the root
                    return null
                }
                // Check if this directory is a workspace root
                const is_workspace = workspaces.workspaces.some((ws) => path.dirname(ws.config.source_file) === dirPath)
                return {
                    is_workspace,
                    name: dirent.name,
                    path: dirPath,
                }
            }).filter((entry) => entry !== null))
        } catch(error) {
            logger.error(`[api] Failed to list directory: ${absPath} - ${error}`)
        }

        // Find parent path - set to null if we're at the browse root
        const resolvedPath = path.resolve(absPath)
        let parent: string | null = null
        if (resolvedPath !== resolvedRoot) {
            const parentPath = path.dirname(absPath)
            // Validate parent path is still within root (should always be true, but extra safety check)
            try {
                parent = validateBrowsePath(parentPath)
            } catch {
                // If parent is outside root, set to null (shouldn't happen, but safety check)
                parent = null
            }
        }

        // Find current workspace if any
        const currentWorkspace = workspaces.workspaces.find((ws) => path.dirname(ws.config.source_file) === absPath) || null

        return {
            current: {
                path: absPath,
                workspace: currentWorkspace ?
                        {
                            config: currentWorkspace.config,
                            id: currentWorkspace.config.workspace_id,
                        } :
                    null,
            },
            directories: entries,
            parent,
        }
    })

    api.get('/api/workspaces/:workspace_id', async(context, req) => {
        const workspaceId = req.params.workspace_id
        const ws = workspaces.get(workspaceId)
        if (!ws) {
            throw new Error(`Workspace not found: ${workspaceId}`)
        }
        // Only return serializable fields
        return {
            config: ws.config,
            // oxlint-disable-next-line prefer-structured-clone
            i18n: ws.i18n ? JSON.parse(JSON.stringify(ws.i18n)) : undefined,
            id: ws.config.workspace_id,
        }
    })
}

// Default export for backward compatibility
export default function apiWorkspaces(router) {
    // HTTP API endpoints using familiar Express-like pattern
    router.get('/api/workspaces/:workspace_id/usage', async() => {
        // Get the first available engine for usage
        const engine = Object.keys(config.enola.engines)[0] || 'deepl'
        const usage = await enola.usage(engine)
        return new Response(JSON.stringify(usage), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.post('/api/workspaces/:workspace_id', async(req, params) => {
        const workspaceId = params.param0
        const workspace_data = await req.json()

        const workspace = workspaces.get(workspaceId)
        const target_languages = workspace.config.languages.target

        // The languages we have selected in the new situation.
        const selectedLanguages = workspace_data.workspace.config.languages.target

        const currentLanguageIds = target_languages.map((language) => language.id)
        const selectedLanguageIds = selectedLanguages.map((language) => language.id)
        // The languages not yet in our settings
        const addLanguages = selectedLanguages.filter((language) => !currentLanguageIds.includes(language.id))
        const updateLanguages = selectedLanguages
            .filter((language) => currentLanguageIds.includes(language.id))
            .filter((language) => {
                const currentLanguage = target_languages.find((targetLang) => targetLang.id === language.id)
                return currentLanguage.formality !== language.formality
            })

        const removeLanguages = target_languages.filter((language) => !selectedLanguageIds.includes(language.id))
        for (const language of removeLanguages) {
            logger.info(`sync: remove language ${language.id}`)
            await syncLanguage(workspace, language, 'remove')
        }

        await Promise.all([...updateLanguages, ...addLanguages].map((language) => {
            logger.info(`sync: (re)translate language ${language.id}`)
            return syncLanguage(workspace, language, 'update')
        }))

        Object.assign(workspace.config, workspace_data.workspace.config)
        workspace.save()
        return new Response(JSON.stringify({languages: workspace.config.languages}), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.delete('/api/workspaces/:workspace_id', async(req, params) => {
        const workspaceId = params.param0
        logger.info(`Deleting workspace: ${workspaceId}`)
        await workspaces.delete(workspaceId)

        return new Response(JSON.stringify({message: 'ok'}), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.post('/api/workspaces', async(req) => {
        try {
            const body = await req.json()
            const workspace = await workspaces.add(body.path)

            return new Response(JSON.stringify({workspace: workspace.config}), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch(error) {
            logger.error(`Failed to add workspace: ${error}`)
            return new Response(JSON.stringify({error: error.message}), {
                headers: {'Content-Type': 'application/json'},
                status: 400,
            })
        }
    })
}
