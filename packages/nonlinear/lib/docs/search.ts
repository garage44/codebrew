/**
 * Vector search implementation using sqlite-vec
 */

import {logger} from '../../service.ts'
import {db} from '../database.ts'
import {generateEmbedding} from './embeddings.ts'
import type {Documentation} from '../database.ts'
import type {Ticket} from '../database.ts'

export interface DocFilters {
    tags?: string[]
    workspace?: string
}

export interface SearchResult {
    chunk: {
        index: number
        score: number
        text: string
    }
    doc: Documentation
}

export interface TicketSearchResult {
    score: number
    ticket: Ticket
}

/**
 * Unified semantic search across docs and tickets
 */
export async function unifiedVectorSearch(
    query: string,
    options: {
        contentType?: 'doc' | 'ticket' | 'both'
        filters?: DocFilters
        limit?: number
    } = {},
): Promise<{
    docs: SearchResult[]
    tickets: TicketSearchResult[]
}> {
    if (!db) throw new Error('Database not initialized')

    const {contentType = 'both', filters, limit = 10} = options

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query)
    const embeddingJson = JSON.stringify(Array.from(queryEmbedding))

    // Build query
    let querySql = `
        SELECT
            content_type,
            content_id,
            chunk_index,
            chunk_text,
            metadata,
            distance
        FROM vec_content
        WHERE embedding MATCH ?
    `

    const params: any[] = [embeddingJson]

    // Filter by content type
    if (contentType !== 'both') {
        querySql += ' AND content_type = ?'
        params.push(contentType)
    }

    // Add workspace filtering if provided
    if (filters?.workspace) {
        querySql += ' AND metadata LIKE ?'
        params.push(`%"workspace":"${filters.workspace}"%`)
    }

    querySql += `
        ORDER BY distance ASC
        LIMIT ?
    `
    // Get more results to filter
    params.push(limit * 2)

    // Execute query
    let results: Array<{
        chunk_index: number | null
        chunk_text: string
        content_id: string
        content_type: 'doc' | 'ticket'
        distance: number
        metadata: string
    }> = []

    try {
        results = db.prepare(querySql).all(...params) as Array<{
            chunk_index: number | null
            chunk_text: string
            content_id: string
            content_type: 'doc' | 'ticket'
            distance: number
            metadata: string
        }>
    } catch(error) {
        // vec0 table might not exist (sqlite-vec not loaded)
        logger.warn('[Search] Vector search failed, vec0 table may not exist:', error)
        return {docs: [], tickets: []}
    }

    // Separate docs and tickets
    const docResults: SearchResult[] = []
    const ticketResults: TicketSearchResult[] = []

    for (const result of results) {
        // Convert distance to similarity score (0-1)
        const score = 1 - (result.distance / 2)

        if (result.content_type === 'doc') {
            const doc = db.prepare('SELECT * FROM documentation WHERE id = ?').get(result.content_id) as Documentation | undefined
            if (doc) {
                // Apply tag filtering if provided
                if (filters?.tags && filters.tags.length > 0) {
                    const docLabels = db.prepare(`
                        SELECT label FROM documentation_labels WHERE doc_id = ?
                    `).all(doc.id) as Array<{label: string}>
                    const docTags = docLabels.map((l) => l.label)
                    const hasMatchingTag = filters.tags.some((tag) => docTags.includes(tag))
                    if (!hasMatchingTag) continue
                }

                docResults.push({
                    chunk: {
                        index: result.chunk_index!,
                        score,
                        text: result.chunk_text,
                    },
                    doc,
                })
            }
        } else if (result.content_type === 'ticket') {
            const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.content_id) as Ticket | undefined
            if (ticket) {
                // Apply tag filtering if provided
                if (filters?.tags && filters.tags.length > 0) {
                    const ticketLabels = db.prepare(`
                        SELECT label FROM ticket_labels WHERE ticket_id = ?
                    `).all(ticket.id) as Array<{label: string}>
                    const ticketTags = ticketLabels.map((l) => l.label)
                    const hasMatchingTag = filters.tags.some((tag) => ticketTags.includes(tag))
                    if (!hasMatchingTag) continue
                }

                ticketResults.push({
                    score,
                    ticket,
                })
            }
        }
    }

    return {
        docs: docResults.slice(0, limit),
        tickets: ticketResults.slice(0, limit),
    }
}

/**
 * Search only documentation
 */
export async function searchDocs(
    query: string,
    filters?: DocFilters,
    limit: number = 10,
): Promise<SearchResult[]> {
    const result = await unifiedVectorSearch(query, {
        contentType: 'doc',
        filters,
        limit,
    })
    return result.docs
}

/**
 * Search only tickets
 */
export async function searchTickets(
    query: string,
    filters?: DocFilters,
    limit: number = 10,
): Promise<TicketSearchResult[]> {
    const result = await unifiedVectorSearch(query, {
        contentType: 'ticket',
        filters,
        limit,
    })
    return result.tickets
}
