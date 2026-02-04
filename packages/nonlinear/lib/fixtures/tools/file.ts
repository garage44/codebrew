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
    type: string
    imports: string[]
    exports: string[]
    relatedFiles: string[]
    structure: string[]
}> {
    const ext = path.extname(filePath)
    const type = ext === '.ts' || ext === '.tsx' ? 'typescript' :
        ext === '.js' || ext === '.jsx' ? 'javascript' :
        ext === '.css' ? 'css' :
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

    // Find related files (files that import this file)
    // This would require scanning the codebase - simplified for now
    const relatedFiles: string[] = []

    // Extract structure (functions, classes)
    const structureRegex = /(?:function|class|interface|type|enum)\s+(\w+)/g
    const structure: string[] = []
    while ((match = structureRegex.exec(content)) !== null) {
        structure.push(match[1])
    }

    return {
        type,
        imports,
        exports,
        relatedFiles,
        structure,
    }
}

export const fileTools: Record<string, Tool> = {
    read_file: {
        name: 'read_file',
        description: 'Read file with syntax context and related file hints',
        parameters: [
            {
                name: 'path',
                type: 'string',
                description: 'File path relative to repository root',
                required: true,
            },
        ],
        execute: async (params: {path: string}, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const filePath = path.join(context.repositoryPath, params.path)

                // Validate path (prevent directory traversal)
                const resolvedPath = path.resolve(filePath)
                const resolvedRepo = path.resolve(context.repositoryPath)
                if (!resolvedPath.startsWith(resolvedRepo)) {
                    return {
                        success: false,
                        error: 'Invalid file path',
                    }
                }

                const content = await Bun.file(filePath).text()
                const contextInfo = await getFileContext(filePath, content)

                return {
                    success: true,
                    data: content,
                    context: {
                        fileType: contextInfo.type,
                        imports: contextInfo.imports,
                        exports: contextInfo.exports,
                        relatedFiles: contextInfo.relatedFiles,
                        structure: contextInfo.structure,
                    },
                }
            } catch (error) {
                logger.error(`[FileTool] Failed to read file ${params.path}:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    write_file: {
        name: 'write_file',
        description: 'Write file using AST-based editing when possible, otherwise full replacement',
        parameters: [
            {
                name: 'path',
                type: 'string',
                description: 'File path relative to repository root',
                required: true,
            },
            {
                name: 'content',
                type: 'string',
                description: 'File content (for replace mode)',
                required: false,
            },
            {
                name: 'edits',
                type: 'array',
                description: 'AST-based edits (preferred over content replacement)',
                required: false,
            },
            {
                name: 'mode',
                type: 'string',
                description: 'Mode: replace, ast, or patch',
                required: false,
            },
        ],
        execute: async (params: {
            path: string
            content?: string
            edits?: unknown[]
            mode?: 'replace' | 'ast' | 'patch'
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const filePath = path.join(context.repositoryPath, params.path)

                // Validate path
                const resolvedPath = path.resolve(filePath)
                const resolvedRepo = path.resolve(context.repositoryPath)
                if (!resolvedPath.startsWith(resolvedRepo)) {
                    return {
                        success: false,
                        error: 'Invalid file path',
                    }
                }

                // For now, use full replacement (AST editing will be added later)
                if (params.content) {
                    // Ensure directory exists
                    const dir = path.dirname(filePath)
                    await Bun.write(filePath, params.content)

                    logger.info(`[FileTool] Wrote file: ${params.path}`)

                    return {
                        success: true,
                        context: {
                            filesAffected: [params.path],
                            changesSummary: 'File written',
                        },
                    }
                }

                return {
                    success: false,
                    error: 'Either content or edits must be provided',
                }
            } catch (error) {
                logger.error(`[FileTool] Failed to write file ${params.path}:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    search_files: {
        name: 'search_files',
        description: 'Search files by pattern or content',
        parameters: [
            {
                name: 'pattern',
                type: 'string',
                description: 'File pattern (e.g., "*.ts", "**/*.test.ts")',
                required: false,
            },
            {
                name: 'content',
                type: 'string',
                description: 'Search for content in files',
                required: false,
            },
            {
                name: 'directory',
                type: 'string',
                description: 'Directory to search in (relative to repository root)',
                required: false,
            },
        ],
        execute: async (params: {
            pattern?: string
            content?: string
            directory?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const searchDir = params.directory
                    ? path.join(context.repositoryPath, params.directory)
                    : context.repositoryPath

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
                        success: false,
                        error: 'Either pattern or content must be provided',
                    }
                }

                // Enrich with file metadata
                const enriched = await Promise.all(
                    results.map(async (filePath) => {
                        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(context.repositoryPath, filePath)
                        const stat = await Bun.file(fullPath).stat().catch(() => null)
                        return {
                            path: path.relative(context.repositoryPath, fullPath),
                            size: stat?.size || 0,
                            modified: stat?.mtime || null,
                        }
                    })
                )

                return {
                    success: true,
                    data: enriched,
                    context: {
                        totalFiles: enriched.length,
                    },
                }
            } catch (error) {
                logger.error(`[FileTool] Failed to search files:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
