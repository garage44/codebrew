/**
 * File Editor Utility
 * Handles file modifications for developer agent
 */

import {logger} from '../../service.ts'
import fs from 'fs-extra'
import path from 'node:path'

export interface FileModification {
    changes: string
    path: string

    /*
     * Changes can be:
     * - Full file replacement (if changes is complete file content)
     * - Diff/patch format (future enhancement)
     * - JSON patch format (future enhancement)
     */
}

/**
 * Apply file modifications
 * Currently supports full file replacement
 * Future: Add AST manipulation and diff/patch support
 */
export async function applyFileModifications(
    repoPath: string,
    modifications: FileModification[],
): Promise<{error?: string; path: string; success: boolean}[]> {
    const results: {error?: string; path: string; success: boolean}[] = []

    for (const mod of modifications) {
        try {
            const filePath = path.join(repoPath, mod.path)

            // Ensure directory exists
            const dir = path.dirname(filePath)
            await fs.ensureDir(dir)

            // Create backup before modification
            const backupPath = `${filePath}.backup.${Date.now()}`
            if (await fs.pathExists(filePath)) {
                await fs.copy(filePath, backupPath)
                logger.debug(`[FileEditor] Created backup: ${backupPath}`)
            }

            // Apply modification (full file replacement for now)
            await fs.writeFile(filePath, mod.changes, 'utf8')

            logger.info(`[FileEditor] Modified file: ${mod.path}`)
            results.push({
                path: mod.path,
                success: true,
            })

            // Clean up backup after successful modification
            if (await fs.pathExists(backupPath)) {
                /*
                 * Keep backup for now, could delete after validation
                 * await fs.remove(backupPath)
                 */
            }
        } catch(error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            logger.error(`[FileEditor] Failed to modify ${mod.path}: ${errorMsg}`)
            results.push({
                error: errorMsg,
                path: mod.path,
                success: false,
            })
        }
    }

    return results
}

/**
 * Validate file modifications before applying
 */
export function validateModifications(modifications: FileModification[]): {
    invalid: FileModification[]
    valid: FileModification[]
} {
    const valid: FileModification[] = []
    const invalid: FileModification[] = []

    for (const mod of modifications) {
        // Basic validation
        if (!mod.path || !mod.changes) {
            invalid.push(mod)
        } else if (mod.path.includes('..') || mod.path.startsWith('/')) {
            // Check for path traversal attempts
            invalid.push(mod)
        } else {
            valid.push(mod)
        }
    }

    return {invalid, valid}
}
