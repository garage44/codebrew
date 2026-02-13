import {deepSignal as originalDeepSignal, type DeepSignal} from 'deepsignal'

import type {CommonState} from '../types'
import type {Notification} from './notifier'

const persistentState = {
    beta: true,
    panels: {
        context: {
            collapsed: false,
            width: 200,
        },
        menu: {
            collapsed: false,
            width: 240,
        },
    },
    theme: 'system',
} as const

const volatileState: Partial<CommonState> = {
    env: {
        ctrlKey: false,
        isFirefox: false,
        layout: 'desktop',
        shiftKey: false,
        url: '',
    },
    hmr_updating: false,
    language_ui: {
        /** Stores the calls to i18next.t, allowing to reactively update $t */
        i18n: {} as Record<string, Record<string, string>>,
        options: [
            {id: 'ara', name: 'Arabic'},
            {id: 'zho', name: 'Chinese (Simplified)'},
            {id: 'nld', name: 'Dutch'},
            {id: 'eng-gbr', name: 'English'},
            {id: 'fra', name: 'French'},
            {id: 'deu', name: 'German'},
        ],
        selection: 'eng-gbr',
    },
    notifications: [] as Notification[],
    profile: {
        admin: false,
        authenticated: false,
        avatar: 'placeholder-1.png',
        displayName: '',
        id: null,
        password: '',
        username: '',
    },
}

/**
 * Extract file path from stack trace
 * Attempts to find the first file path that looks like a source file (not node_modules or bundled)
 */
function getFilePathFromStack(): string | null {
    try {
        const stack = new Error().stack
        if (!stack) return null

        const lines = stack.split('\n')

        /*
         * Skip the first few lines (Error, getFilePathFromStack, deepSignal wrapper)
         * Look for lines that contain file URLs or paths
         */
        for (let i = 3; i < lines.length; i++) {
            const line = lines[i]
            // Match file:// URLs or http:// URLs pointing to source files
            const fileMatch = line.match(/(?:file:\/\/|https?:\/\/[^/]+\/)(.+?)(?::\d+:\d+|$)/)
            if (fileMatch) {
                let filePath = fileMatch[1]
                // Remove query params and hash
                filePath = filePath.split('?')[0].split('#')[0]

                /*
                 * Try to extract workspace-relative path
                 * Look for src/components/ pattern
                 */
                const srcMatch = filePath.match(/(?:.*\/)?(src\/components\/.+)$/)
                if (srcMatch) {
                    return srcMatch[1]
                }
                // Fallback: return the file path as-is
                return filePath
            }
        }
    } catch {
        // Ignore errors
    }
    return null
}

// Type declarations for HMR globals
declare global {
    var __HMR_REGISTRY__: Record<string, unknown> | undefined
    var __HMR_COMPONENT_STATES__: Record<string, unknown> | undefined
    var __HMR_STATE__: Record<string, unknown> | null | undefined
}

/**
 * Wrapped deepSignal that auto-registers state for HMR
 */
function deepSignal<T extends object>(initialValue: T): DeepSignal<T> {
    // Create the state using original deepSignal
    const state = originalDeepSignal(initialValue)

    // Only register for HMR in browser environment
    if (typeof window !== 'undefined') {
        // Initialize registry if not exists
        if (!globalThis.__HMR_REGISTRY__) {
            globalThis.__HMR_REGISTRY__ = {}
        }

        // Try to get file path from stack trace
        const filePath = getFilePathFromStack()

        if (filePath) {
            // Register state in registry
            globalThis.__HMR_REGISTRY__[filePath] = state

            // Check for saved state and restore if present
            const savedStates = globalThis.__HMR_COMPONENT_STATES__ || {}
            const savedState = savedStates[filePath]

            if (savedState) {
                try {
                    // Merge saved state into current state
                    Object.assign(state, savedState)
                    // Clear the saved state after restoration
                    delete savedStates[filePath]
                } catch (error) {
                    console.warn(`[Bunchy HMR] Could not restore state for ${filePath}:`, error)
                }
            }
        }
    }

    return state
}

export {persistentState, volatileState, deepSignal}
