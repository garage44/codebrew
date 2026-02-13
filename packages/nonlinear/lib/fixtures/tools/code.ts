/**
 * Code analysis tools using vector search
 */

import type {Tool, ToolContext, ToolResult} from './types.ts'

import {logger} from '../../../service.ts'
import {searchCode, findSimilarCode} from '../../docs/code-embeddings.ts'

export const codeTools: Record<string, Tool> = {
    find_similar_code: {
        description: 'Find code similar to given code snippet',
        execute: async (params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> => {
            const {code, repositoryId, limit} = params as {code: string; limit?: number; repositoryId: string}
            try {
                const results = await findSimilarCode(code, repositoryId, limit || 5)

                return {
                    context: {
                        fileTypes: [
                            ...new Set(
                                results.map((r) => {
                                    const ext = r.file_path.split('.').pop()
                                    return ext || 'unknown'
                                }),
                            ),
                        ],
                        similarityScores: results.map((r) => ({
                            chunk: r.chunk_name,
                            file: r.file_path,
                            score: (1 - r.distance) * 100, // Convert distance to similarity percentage
                        })),
                    },
                    data: results,
                    success: true,
                }
            } catch (error) {
                logger.error('[CodeTool] Failed to find similar code:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'find_similar_code',
        parameters: [
            {
                description: 'Code snippet to find similar code for',
                name: 'code',
                required: true,
                type: 'string',
            },
            {
                description: 'Repository ID to search in',
                name: 'repositoryId',
                required: true,
                type: 'string',
            },
            {
                description: 'Maximum number of results',
                name: 'limit',
                required: false,
                type: 'number',
            },
        ],
    },

    search_code: {
        description: 'Semantic code search - find similar functions, classes, or patterns',
        execute: async (params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> => {
            const {fileType, limit, query, repositoryId} = params as {
                fileType?: string
                limit?: number
                query: string
                repositoryId: string
            }
            try {
                const results = await searchCode(query, repositoryId, {
                    fileType,
                    limit: limit || 10,
                })

                return {
                    context: {
                        relatedFiles: [...new Set(results.map((r) => r.file_path))],
                        totalResults: results.length,
                    },
                    data: results,
                    success: true,
                }
            } catch (error) {
                logger.error('[CodeTool] Failed to search code:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'search_code',
        parameters: [
            {
                description: 'Search query (e.g., "authentication function", "error handling")',
                name: 'query',
                required: true,
                type: 'string',
            },
            {
                description: 'Repository ID to search in',
                name: 'repositoryId',
                required: true,
                type: 'string',
            },
            {
                description: 'Filter by file type (e.g., "ts", "tsx")',
                name: 'fileType',
                required: false,
                type: 'string',
            },
            {
                description: 'Maximum number of results',
                name: 'limit',
                required: false,
                type: 'number',
            },
        ],
    },
}
