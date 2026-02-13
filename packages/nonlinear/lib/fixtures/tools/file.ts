/**
 * File operation tools
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import path from 'node:path'
// Bun is a global in Bun runtime

/**
 * Get file context (imports, exports, related files)
 */
async function getFileContext(filePath: string, content: string): Promise<{
    exports: string[]
    imports: string[]
    relatedFiles: string[]
    structure: string[]
    type: string
}> {
    const ext = path.extname(filePath)
    const type = ext === '.ts' || ext === '.tsx' ?
        'typescript' :
        ext === '.js' || ext === '.jsx' ?
            'javascript' :
            ext === '.css' ?
                'css' :
                ext === '.json' ? 'json' : 'unknown'

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
        execute: async(params: {path: string}, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const filePath = path.join(context.repositoryPath, params.path)

                // Validate path (prevent directory traversal)
                const resolvedPath = path.resolve(filePath)
                const resolvedRepo = path.resolve(context.repositoryPath)
                if (!resolvedPath.startsWith(resolvedRepo)) {
                    return {
                        error: 'Invalid file path',
                        success: false,
                    }
                }

                const content = await Bun.file(filePath).text()
                const contextInfo = await getFileContext(filePath, content)

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
            } catch(error) {
                logger.error(`[FileTool] Failed to read file ${params.path}:`, error)
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
        execute: async(params: {
            content?: string
            directory?: string
            pattern?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const searchDir = params.directory ?
                        path.join(context.repositoryPath, params.directory) :
                    context.repositoryPath

                // Use Bun Shell for file search
                const {$} = await import('bun')

                let results: string[] = []

                if (params.pattern) {
                    // Search by pattern
                    const result = await $`find ${searchDir} -name ${params.pattern}`
                        .cwd(context.repositoryPath)
                        .quiet()
                        .text()
                    results = result.split('\n').filter(Boolean)
                } else if (params.content) {
                    // Search by content (grep)
                    const result = await $`grep -r -l ${params.content} ${searchDir}`
                        .cwd(context.repositoryPath)
                        .quiet()
                        .nothrow()
                        .text()
                    results = result.split('\n').filter(Boolean)
                } else {
                    return {
                        error: 'Either pattern or content must be provided',
                        success: false,
                    }
                }

                // Enrich with file metadata
                const enriched = await Promise.all(
                    results.map(async(filePath) => {
                        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(context.repositoryPath, filePath)
                        const stat = await Bun.file(fullPath).stat().catch(() => null)
                        return {
                            modified: stat?.mtime || null,
                            path: path.relative(context.repositoryPath, fullPath),
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
            } catch(error) {
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
        execute: async(params: {
            content?: string
            edits?: unknown[]
            mode?: 'replace' | 'ast' | 'patch'
            path: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const filePath = path.join(context.repositoryPath, params.path)

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
                if (params.content) {
                    // Ensure directory exists
                    const dir = path.dirname(filePath)
                    await Bun.write(filePath, params.content)

                    logger.info(`[FileTool] Wrote file: ${params.path}`)

                    return {
                        context: {
                            changesSummary: 'File written',
                            filesAffected: [params.path],
                        },
                        success: true,
                    }
                }

                return {
                    error: 'Either content or edits must be provided',
                    success: false,
                }
            } catch(error) {
                logger.error(`[FileTool] Failed to write file ${params.path}:`, error)
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
