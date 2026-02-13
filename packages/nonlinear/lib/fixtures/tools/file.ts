/**
 * File operation tools
 */

import path from 'node:path'

import type {Tool, ToolContext, ToolResult} from './types.ts'

import {logger} from '../../../service.ts'
// Bun is a global in Bun runtime

/**
 * Get file context (imports, exports, related files)
 */
async function getFileContext(
    filePath: string,
    content: string,
): Promise<{
    exports: string[]
    imports: string[]
    relatedFiles: string[]
    structure: string[]
    type: string
}> {
    const ext = path.extname(filePath)
    const type =
        ext === '.ts' || ext === '.tsx'
            ? 'typescript'
            : ext === '.js' || ext === '.jsx'
              ? 'javascript'
              : ext === '.css'
                ? 'css'
                : ext === '.json'
                  ? 'json'
                  : 'unknown'

    // Extract imports (simple regex for now, can be enhanced with AST)
    const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g
    const imports: string[] = []
    let match
    while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1])
    }

    // Extract exports (simple regex)
    const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g
    const exports: string[] = []
    while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1])
    }

    /*
     * Find related files (files that import this file)
     * This would require scanning the codebase - simplified for now
     */
    const relatedFiles: string[] = []

    // Extract structure (functions, classes)
    const structureRegex = /(?:function|class|interface|type|enum)\s+(\w+)/g
    const structure: string[] = []
    while ((match = structureRegex.exec(content)) !== null) {
        structure.push(match[1])
    }

    return {
        exports,
        imports,
        relatedFiles,
        structure,
        type,
    }
}

export const fileTools: Record<string, Tool> = {
    read_file: {
        description: 'Read file with syntax context and related file hints',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {path: filePath} = params as {path: string}
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const fullPath = path.join(context.repositoryPath, filePath)

                // Validate path (prevent directory traversal)
                const resolvedPath = path.resolve(fullPath)
                const resolvedRepo = path.resolve(context.repositoryPath)
                if (!resolvedPath.startsWith(resolvedRepo)) {
                    return {
                        error: 'Invalid file path',
                        success: false,
                    }
                }

                const content = await Bun.file(fullPath).text()
                const contextInfo = await getFileContext(fullPath, content)

                return {
                    context: {
                        exports: contextInfo.exports,
                        fileType: contextInfo.type,
                        imports: contextInfo.imports,
                        relatedFiles: contextInfo.relatedFiles,
                        structure: contextInfo.structure,
                    },
                    data: content,
                    success: true,
                }
            } catch (error) {
                logger.error(`[FileTool] Failed to read file ${filePath}:`, error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'read_file',
        parameters: [
            {
                description: 'File path relative to repository root',
                name: 'path',
                required: true,
                type: 'string',
            },
        ],
    },

    search_files: {
        description: 'Search files by pattern or content',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {content, directory, pattern} = params as {content?: string; directory?: string; pattern?: string}
            const repoPath = context.repositoryPath
            try {
                if (!repoPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const searchDir = directory ? path.join(repoPath, directory) : repoPath

                // Use Bun Shell for file search
                const {$} = await import('bun')

                let results: string[] = []

                if (pattern) {
                    // Search by pattern
                    const result = await $`find ${searchDir} -name ${pattern}`.cwd(repoPath).quiet().text()
                    results = result.split('\n').filter(Boolean)
                } else if (content) {
                    // Search by content (grep)
                    const result = await $`grep -r -l ${content} ${searchDir}`.cwd(repoPath).quiet().nothrow().text()
                    results = result.split('\n').filter(Boolean)
                } else {
                    return {
                        error: 'Either pattern or content must be provided',
                        success: false,
                    }
                }

                // Enrich with file metadata
                const enriched = await Promise.all(
                    results.map(async (resultPath) => {
                        const absPath = path.isAbsolute(resultPath) ? resultPath : path.join(repoPath, resultPath)
                        const stat = await Bun.file(absPath)
                            .stat()
                            .catch(() => null)
                        return {
                            modified: stat?.mtime || null,
                            path: path.relative(repoPath, absPath),
                            size: stat?.size || 0,
                        }
                    }),
                )

                return {
                    context: {
                        totalFiles: enriched.length,
                    },
                    data: enriched,
                    success: true,
                }
            } catch (error) {
                logger.error('[FileTool] Failed to search files:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'search_files',
        parameters: [
            {
                description: 'File pattern (e.g., "*.ts", "**/*.test.ts")',
                name: 'pattern',
                required: false,
                type: 'string',
            },
            {
                description: 'Search for content in files',
                name: 'content',
                required: false,
                type: 'string',
            },
            {
                description: 'Directory to search in (relative to repository root)',
                name: 'directory',
                required: false,
                type: 'string',
            },
        ],
    },

    write_file: {
        description: 'Write file using AST-based editing when possible, otherwise full replacement',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {
                content,
                edits,
                mode,
                path: writePath,
            } = params as {content?: string; edits?: unknown[]; mode?: 'replace' | 'ast' | 'patch'; path: string}
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const filePath = path.join(context.repositoryPath, writePath)

                // Validate path
                const resolvedPath = path.resolve(filePath)
                const resolvedRepo = path.resolve(context.repositoryPath)
                if (!resolvedPath.startsWith(resolvedRepo)) {
                    return {
                        error: 'Invalid file path',
                        success: false,
                    }
                }

                // For now, use full replacement (AST editing will be added later)
                if (content) {
                    await Bun.write(filePath, content)

                    logger.info(`[FileTool] Wrote file: ${writePath}`)

                    return {
                        context: {
                            changesSummary: 'File written',
                            filesAffected: [writePath],
                        },
                        success: true,
                    }
                }

                return {
                    error: 'Either content or edits must be provided',
                    success: false,
                }
            } catch (error) {
                logger.error(`[FileTool] Failed to write file ${(params as {path?: string})?.path ?? 'unknown'}:`, error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'write_file',
        parameters: [
            {
                description: 'File path relative to repository root',
                name: 'path',
                required: true,
                type: 'string',
            },
            {
                description: 'File content (for replace mode)',
                name: 'content',
                required: false,
                type: 'string',
            },
            {
                description: 'AST-based edits (preferred over content replacement)',
                name: 'edits',
                required: false,
                type: 'array',
            },
            {
                description: 'Mode: replace, ast, or patch',
                name: 'mode',
                required: false,
                type: 'string',
            },
        ],
    },
}
