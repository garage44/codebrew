/**
 * Documentation WebSocket API Routes
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {db, getLabelDefinition} from '../lib/database.ts'
import {randomId} from '@garage44/common/lib/utils'
import {logger} from '../service.ts'
import {generateDocEmbeddings} from '../lib/docs/embeddings.ts'
import {unifiedVectorSearch, searchDocs, searchTickets} from '../lib/docs/search.ts'
import type {DocFilters} from '../lib/docs/search.ts'

/**
 * Enrich doc with labels
 */
function enrichDoc(doc: {
    [key: string]: unknown
    id: string
}): typeof doc & {
    labelDefinitions?: Array<{color: string; name: string}>
    tags: string[]
} {
    const labels = db.prepare(`
        SELECT label FROM documentation_labels WHERE doc_id = ?
    `).all(doc.id) as Array<{label: string}>

    const tags = labels.map(l => l.label)
    const labelDefinitions = tags.map((tag) => {
        const def = getLabelDefinition(tag)
        return def ? {color: def.color, name: def.name} : null
    }).filter((def): def is {color: string; name: string} => def !== null)

    return {
        ...doc,
        labelDefinitions,
        tags,
    }
}

/**
 * HTTP API routes for documentation (public access)
 * These routes are accessible without authentication
 */
export default function apiDocs(router: {
    get: (path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) => void
    post: (path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) => void
    put: (path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) => void
    delete: (path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) => void
}) {
    // List docs (public)
    router.get('/api/docs', async(_req: Request, _params: Record<string, string>, _session: unknown) => {
        const url = new URL(_req.url)
        const tags = url.searchParams.get('tags') ? url.searchParams.get('tags')!.split(',') : undefined
        const workspace = url.searchParams.get('workspace') || undefined

        let query = 'SELECT * FROM documentation WHERE 1=1'
        const params: any[] = []

        if (workspace) {
            const workspaceTag = `workspace:${workspace}`
            query += ` AND id IN (
                SELECT doc_id FROM documentation_labels WHERE label = ?
            )`
            params.push(workspaceTag)
        }

        if (tags && tags.length > 0) {
            query += ` AND id IN (
                SELECT doc_id FROM documentation_labels WHERE label IN (${tags.map(() => '?').join(',')})
            )`
            params.push(...tags)
        }

        query += ' ORDER BY updated_at DESC'

        const docs = db.prepare(query).all(...params) as Array<{
            id: string
            path: string
            title: string
            content: string
            author_id: string
            created_at: number
            updated_at: number
        }>

        return new Response(JSON.stringify({docs: docs.map(enrichDoc)}), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    // Get doc by path (public)
    router.get('/api/docs/by-path', async(_req: Request, _params: Record<string, string>, _session: unknown) => {
        const url = new URL(_req.url)
        const path = url.searchParams.get('path')

        if (!path) {
            return new Response(JSON.stringify({error: 'Path parameter required'}), {
                headers: {'Content-Type': 'application/json'},
                status: 400,
            })
        }

        const doc = db.prepare('SELECT * FROM documentation WHERE path = ?').get(path) as {
            id: string
            path: string
            title: string
            content: string
            author_id: string
            created_at: number
            updated_at: number
        } | undefined

        if (!doc) {
            return new Response(JSON.stringify({error: 'Documentation not found'}), {
                headers: {'Content-Type': 'application/json'},
                status: 404,
            })
        }

        return new Response(JSON.stringify({doc: enrichDoc(doc)}), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    // Semantic search (public)
    router.get('/api/docs/search', async(_req: Request, _params: Record<string, string>, _session: unknown) => {
        const url = new URL(_req.url)
        const query = url.searchParams.get('query') || ''
        const limit = parseInt(url.searchParams.get('limit') || '10', 10)
        const tags = url.searchParams.get('tags') ? url.searchParams.get('tags')!.split(',') : undefined
        const workspace = url.searchParams.get('workspace') || undefined

        if (!query) {
            return new Response(JSON.stringify({error: 'Query parameter required'}), {
                headers: {'Content-Type': 'application/json'},
                status: 400,
            })
        }

        try {
            const {searchDocs} = await import('../lib/docs/search.ts')
            const filters: {tags?: string[]; workspace?: string} = {}
            if (tags) filters.tags = tags
            if (workspace) filters.workspace = workspace

            const results = await searchDocs(query, filters, limit)

            return new Response(JSON.stringify({results}), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            return new Response(JSON.stringify({error: error instanceof Error ? error.message : String(error)}), {
                headers: {'Content-Type': 'application/json'},
                status: 500,
            })
        }
    })

    // Unified search (public)
    router.get('/api/search', async(_req: Request, _params: Record<string, string>, _session: unknown) => {
        const url = new URL(_req.url)
        const query = url.searchParams.get('query') || ''
        const limit = parseInt(url.searchParams.get('limit') || '10', 10)
        const contentType = (url.searchParams.get('contentType') || 'both') as 'doc' | 'ticket' | 'both'
        const tags = url.searchParams.get('tags') ? url.searchParams.get('tags')!.split(',') : undefined
        const workspace = url.searchParams.get('workspace') || undefined

        if (!query) {
            return new Response(JSON.stringify({error: 'Query parameter required'}), {
                headers: {'Content-Type': 'application/json'},
                status: 400,
            })
        }

        try {
            const {unifiedVectorSearch} = await import('../lib/docs/search.ts')
            const filters: {tags?: string[]; workspace?: string} = {}
            if (tags) filters.tags = tags
            if (workspace) filters.workspace = workspace

            const results = await unifiedVectorSearch(query, {
                limit,
                contentType,
                filters,
            })

            return new Response(JSON.stringify(results), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            return new Response(JSON.stringify({error: error instanceof Error ? error.message : String(error)}), {
                headers: {'Content-Type': 'application/json'},
                status: 500,
            })
        }
    })
}

export function registerDocsWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // List docs (filter by tags, workspace)
    wsManager.api.get('/api/docs', async(_ctx, req) => {
        const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined
        const workspace = req.query.workspace as string | undefined

        let query = 'SELECT * FROM documentation WHERE 1=1'
        const params: any[] = []

        if (workspace) {
            // Filter by workspace tag
            const workspaceTag = `workspace:${workspace}`
            query += ` AND id IN (
                SELECT doc_id FROM documentation_labels WHERE label = ?
            )`
            params.push(workspaceTag)
        }

        if (tags && tags.length > 0) {
            // Filter by tags
            query += ` AND id IN (
                SELECT doc_id FROM documentation_labels WHERE label IN (${tags.map(() => '?').join(',')})
            )`
            params.push(...tags)
        }

        query += ' ORDER BY updated_at DESC'

        const docs = db.prepare(query).all(...params) as Array<{
            id: string
            path: string
            title: string
            content: string
            author_id: string
            created_at: number
            updated_at: number
        }>

        return {
            docs: docs.map(enrichDoc),
        }
    })

    // Get doc by ID
    wsManager.api.get('/api/docs/:id', async(_ctx, req) => {
        const docId = req.params.id

        const doc = db.prepare('SELECT * FROM documentation WHERE id = ?').get(docId) as {
            id: string
            path: string
            title: string
            content: string
            author_id: string
            created_at: number
            updated_at: number
        } | undefined

        if (!doc) {
            return {error: 'Documentation not found'}
        }

        return {
            doc: enrichDoc(doc),
        }
    })

    // Get doc by path
    wsManager.api.get('/api/docs/by-path', async(_ctx, req) => {
        const path = req.query.path as string | undefined

        if (!path) {
            return {error: 'Path parameter required'}
        }

        const doc = db.prepare('SELECT * FROM documentation WHERE path = ?').get(path) as {
            id: string
            path: string
            title: string
            content: string
            author_id: string
            created_at: number
            updated_at: number
        } | undefined

        if (!doc) {
            return {error: 'Documentation not found'}
        }

        return {
            doc: enrichDoc(doc),
        }
    })

    // Create doc
    wsManager.api.post('/api/docs', async(ctx, req) => {
        const userId = ctx.user?.id
        if (!userId) {
            return {error: 'Unauthorized'}
        }

        const body = await req.json() as {
            path: string
            title: string
            content: string
            tags?: string[]
        }

        // Validate tag format (hyphens only)
        if (body.tags) {
            for (const tag of body.tags) {
                if (!/^[a-z0-9:-]+$/.test(tag) || tag.includes('_')) {
                    return {error: `Invalid tag format (must use hyphens): ${tag}`}
                }
            }
        }

        const docId = randomId()
        const now = Date.now()

        try {
            // Create doc
            db.prepare(`
                INSERT INTO documentation (id, path, title, content, author_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                docId,
                body.path,
                body.title,
                body.content,
                userId,
                now,
                now
            )

            // Add tags
            if (body.tags) {
                for (const tag of body.tags) {
                    // Ensure tag exists
                    const existing = db.prepare('SELECT id FROM label_definitions WHERE name = ?').get(tag)
                    if (!existing) {
                        const labelId = `label-${tag.toLowerCase().replace(/:/g, '-')}`
                        db.prepare(`
                            INSERT INTO label_definitions (id, name, color, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?)
                        `).run(labelId, tag, '#64748b', now, now)
                    }

                    // Add to documentation_labels
                    try {
                        db.prepare(`
                            INSERT INTO documentation_labels (doc_id, label)
                            VALUES (?, ?)
                        `).run(docId, tag)
                    } catch {
                        // Tag already exists, ignore
                    }
                }
            }

            // Generate embeddings
            try {
                await generateDocEmbeddings(docId, body.content)
            } catch (error) {
                logger.warn(`[Docs API] Failed to generate embeddings for ${docId}:`, error)
                // Continue anyway - embeddings can be regenerated later
            }

            const doc = db.prepare('SELECT * FROM documentation WHERE id = ?').get(docId)!
            return {
                doc: enrichDoc(doc),
            }
        } catch (error) {
            if (String(error).includes('UNIQUE constraint')) {
                return {error: 'Documentation with this path already exists'}
            }
            logger.error('[Docs API] Failed to create doc:', error)
            return {error: 'Failed to create documentation'}
        }
    })

    // Update doc
    wsManager.api.put('/api/docs/:id', async(ctx, req) => {
        const userId = ctx.user?.id
        if (!userId) {
            return {error: 'Unauthorized'}
        }

        const docId = req.params.id
        const body = await req.json() as {
            title?: string
            content: string
            tags?: string[]
        }

        // Validate tag format
        if (body.tags) {
            for (const tag of body.tags) {
                if (!/^[a-z0-9:-]+$/.test(tag) || tag.includes('_')) {
                    return {error: `Invalid tag format (must use hyphens): ${tag}`}
                }
            }
        }

        const now = Date.now()

        try {
            // Update doc
            if (body.title) {
                db.prepare(`
                    UPDATE documentation
                    SET title = ?, content = ?, updated_at = ?
                    WHERE id = ?
                `).run(body.title, body.content, now, docId)
            } else {
                db.prepare(`
                    UPDATE documentation
                    SET content = ?, updated_at = ?
                    WHERE id = ?
                `).run(body.content, now, docId)
            }

            // Update tags if provided
            if (body.tags) {
                // Delete existing tags
                db.prepare('DELETE FROM documentation_labels WHERE doc_id = ?').run(docId)

                // Add new tags
                for (const tag of body.tags) {
                    // Ensure tag exists
                    const existing = db.prepare('SELECT id FROM label_definitions WHERE name = ?').get(tag)
                    if (!existing) {
                        const labelId = `label-${tag.toLowerCase().replace(/:/g, '-')}`
                        db.prepare(`
                            INSERT INTO label_definitions (id, name, color, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?)
                        `).run(labelId, tag, '#64748b', now, now)
                    }

                    // Add to documentation_labels
                    db.prepare(`
                        INSERT INTO documentation_labels (doc_id, label)
                        VALUES (?, ?)
                    `).run(docId, tag)
                }
            }

            // Regenerate embeddings
            try {
                await generateDocEmbeddings(docId, body.content)
            } catch (error) {
                logger.warn(`[Docs API] Failed to regenerate embeddings for ${docId}:`, error)
            }

            const doc = db.prepare('SELECT * FROM documentation WHERE id = ?').get(docId)!
            return {
                doc: enrichDoc(doc),
            }
        } catch (error) {
            logger.error('[Docs API] Failed to update doc:', error)
            return {error: 'Failed to update documentation'}
        }
    })

    // Delete doc
    wsManager.api.delete('/api/docs/:id', async(ctx, _req) => {
        const userId = ctx.user?.id
        if (!userId) {
            return {error: 'Unauthorized'}
        }

        const docId = ctx.params.id

        try {
            db.prepare('DELETE FROM documentation WHERE id = ?').run(docId)
            return {success: true}
        } catch (error) {
            logger.error('[Docs API] Failed to delete doc:', error)
            return {error: 'Failed to delete documentation'}
        }
    })

    // Semantic search (unified docs + tickets)
    wsManager.api.get('/api/search', async(_ctx, req) => {
        const query = req.query.q as string | undefined
        const contentType = req.query.contentType as 'doc' | 'ticket' | 'both' | undefined
        const workspace = req.query.workspace as string | undefined
        const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10

        if (!query) {
            return {error: 'Query parameter required'}
        }

        const filters: DocFilters = {}
        if (workspace) {
            filters.workspace = workspace
        }
        if (tags) {
            filters.tags = tags
        }

        try {
            const result = await unifiedVectorSearch(query, {
                limit,
                contentType: contentType || 'both',
                filters,
            })

            return {
                docs: result.docs.map(r => ({
                    doc: enrichDoc(r.doc),
                    chunk: r.chunk,
                })),
                tickets: result.tickets,
            }
        } catch (error) {
            logger.error('[Docs API] Search failed:', error)
            return {error: 'Search failed', docs: [], tickets: []}
        }
    })

    // Search only docs
    wsManager.api.get('/api/docs/search', async(_ctx, req) => {
        const query = req.query.q as string | undefined
        const workspace = req.query.workspace as string | undefined
        const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10

        if (!query) {
            return {error: 'Query parameter required'}
        }

        const filters: DocFilters = {}
        if (workspace) {
            filters.workspace = workspace
        }
        if (tags) {
            filters.tags = tags
        }

        try {
            const results = await searchDocs(query, filters, limit)
            return {
                results: results.map(r => ({
                    doc: enrichDoc(r.doc),
                    chunk: r.chunk,
                })),
            }
        } catch (error) {
            logger.error('[Docs API] Doc search failed:', error)
            return {error: 'Search failed', results: []}
        }
    })
}
