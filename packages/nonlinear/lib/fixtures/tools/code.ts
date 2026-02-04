/**
 * Code analysis tools using vector search
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {searchCode, findSimilarCode} from '../../docs/code-embeddings.ts'

export const codeTools: Record<string, Tool> = {
    search_code: {
        name: 'search_code',
        description: 'Semantic code search - find similar functions, classes, or patterns',
        parameters: [
            {
                name: 'query',
                type: 'string',
                description: 'Search query (e.g., "authentication function", "error handling")',
                required: true,
            },
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Repository ID to search in',
                required: true,
            },
            {
                name: 'fileType',
                type: 'string',
                description: 'Filter by file type (e.g., "ts", "tsx")',
                required: false,
            },
            {
                name: 'limit',
                type: 'number',
                description: 'Maximum number of results',
                required: false,
            },
        ],
        execute: async (params: {
            query: string
            repositoryId: string
            fileType?: string
            limit?: number
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const results = await searchCode(params.query, params.repositoryId, {
                    limit: params.limit || 10,
                    fileType: params.fileType,
                })

                return {
                    success: true,
                    data: results,
                    context: {
                        relatedFiles: [...new Set(results.map(r => r.file_path))],
                        totalResults: results.length,
                    },
                }
            } catch (error) {
                logger.error(`[CodeTool] Failed to search code:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    find_similar_code: {
        name: 'find_similar_code',
        description: 'Find code similar to given code snippet',
        parameters: [
            {
                name: 'code',
                type: 'string',
                description: 'Code snippet to find similar code for',
                required: true,
            },
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Repository ID to search in',
                required: true,
            },
            {
                name: 'limit',
                type: 'number',
                description: 'Maximum number of results',
                required: false,
            },
        ],
        execute: async (params: {
            code: string
            repositoryId: string
            limit?: number
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const results = await findSimilarCode(params.code, params.repositoryId, params.limit || 5)

                return {
                    success: true,
                    data: results,
                    context: {
                        similarityScores: results.map(r => ({
                            file: r.file_path,
                            chunk: r.chunk_name,
                            score: (1 - r.distance) * 100, // Convert distance to similarity percentage
                        })),
                        fileTypes: [...new Set(results.map(r => {
                            const ext = r.file_path.split('.').pop()
                            return ext || 'unknown'
                        }))],
                    },
                }
            } catch (error) {
                logger.error(`[CodeTool] Failed to find similar code:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
