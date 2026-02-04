/**
 * Documentation search tools
 * Search ADRs, rules, and project documentation semantically
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {searchDocs} from '../../docs/search.ts'
import type {DocFilters} from '../../docs/search.ts'

export const documentationTools: Record<string, Tool> = {
    search_documentation: {
        name: 'search_documentation',
        description: 'Search ADRs, rules, and project documentation semantically. Use this to find architectural decisions, patterns, and project guidelines.',
        parameters: [
            {
                name: 'query',
                type: 'string',
                description: 'What to search for (e.g., "how to handle WebSocket connections", "CSS styling patterns", "authentication flow")',
                required: true,
            },
            {
                name: 'labels',
                type: 'array',
                description: 'Filter by labels/tags (e.g., ["architecture", "frontend", "backend"])',
                required: false,
            },
            {
                name: 'limit',
                type: 'number',
                description: 'Maximum number of results (default: 5)',
                required: false,
            },
        ],
        execute: async (params: {
            query: string
            labels?: string[]
            limit?: number
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const filters: DocFilters = {}
                if (params.labels && params.labels.length > 0) {
                    filters.tags = params.labels
                }

                const limit = params.limit || 5
                const results = await searchDocs(params.query, filters, limit)

                if (results.length === 0) {
                    return {
                        success: true,
                        data: [],
                        context: {
                            message: 'No documentation found matching the query',
                        },
                    }
                }

                const formatted = results.map((result, idx) => ({
                    rank: idx + 1,
                    title: result.doc.title,
                    path: result.doc.path,
                    relevanceScore: (result.chunk.score * 100).toFixed(1) + '%',
                    excerpt: result.chunk.text.substring(0, 500) + (result.chunk.text.length > 500 ? '...' : ''),
                    fullContent: result.doc.content,
                }))

                return {
                    success: true,
                    data: formatted,
                    context: {
                        totalResults: results.length,
                        query: params.query,
                        labels: params.labels || [],
                    },
                }
            } catch (error) {
                logger.error(`[DocumentationTool] Failed to search documentation:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
