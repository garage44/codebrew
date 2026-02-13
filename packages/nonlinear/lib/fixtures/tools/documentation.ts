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
        description: 'Search ADRs, rules, and project documentation semantically. Use this to find architectural decisions, patterns, and project guidelines.',
        execute: async(params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> => {
            const {labels, limit: limitParam, query} = params as {labels?: string[]; limit?: number; query: string}
            try {
                const filters: DocFilters = {}
                if (labels && labels.length > 0) {
                    filters.tags = labels
                }

                const limit = limitParam || 5
                const results = await searchDocs(query, filters, limit)

                if (results.length === 0) {
                    return {
                        context: {
                            message: 'No documentation found matching the query',
                        },
                        data: [],
                        success: true,
                    }
                }

                const formatted = results.map((result, idx) => ({
                    excerpt: result.chunk.text.slice(0, 500) + (result.chunk.text.length > 500 ? '...' : ''),
                    fullContent: result.doc.content,
                    path: result.doc.path,
                    rank: idx + 1,
                    relevanceScore: (result.chunk.score * 100).toFixed(1) + '%',
                    title: result.doc.title,
                }))

                return {
                    context: {
                        labels: labels || [],
                        query,
                        totalResults: results.length,
                    },
                    data: formatted,
                    success: true,
                }
            } catch(error) {
                logger.error('[DocumentationTool] Failed to search documentation:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'search_documentation',
        parameters: [
            {
                description: 'What to search for (e.g., "how to handle WebSocket connections", "CSS styling patterns", "authentication flow")',
                name: 'query',
                required: true,
                type: 'string',
            },
            {
                description: 'Filter by labels/tags (e.g., ["architecture", "frontend", "backend"])',
                name: 'labels',
                required: false,
                type: 'array',
            },
            {
                description: 'Maximum number of results (default: 5)',
                name: 'limit',
                required: false,
                type: 'number',
            },
        ],
    },
}
