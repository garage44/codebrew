/**
 * Embedding generation using local models (default) or Voyage AI/OpenAI
 */

import {randomId} from '@garage44/common/lib/utils'

import {logger} from '../../service.ts'
import {config} from '../config.ts'
import {getDb} from '../database.ts'
import {type Chunk, chunkMarkdown} from './chunking.ts'

/**
 * Generate embedding for text
 * Uses local model by default, can use Voyage AI or OpenAI if configured
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
    if (config.embeddings.provider === 'voyageai') {
        return await generateVoyageEmbedding(text)
    }

    if (config.embeddings.provider === 'local') {
        return await generateLocalEmbedding(text)
    }

    if (config.embeddings.provider === 'openai') {
        return await generateOpenAIEmbedding(text)
    }

    throw new Error(`Unknown embedding provider: ${config.embeddings.provider}`)
}

/**
 * Generate embedding using Voyage AI API
 */
async function generateVoyageEmbedding(text: string): Promise<Float32Array> {
    const apiKey = config.embeddings.voyageai.apiKey || process.env.VOYAGE_API_KEY
    if (!apiKey) {
        throw new Error('Voyage AI API key not configured. Set VOYAGE_API_KEY environment variable.')
    }

    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        body: JSON.stringify({
            input: text,
            model: config.embeddings.voyageai.model || 'voyage-3',
        }),
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        method: 'POST',
    })

    if (!response.ok) {
        const error = await response.json().catch((): {error: {message: string}} => ({error: {message: response.statusText}}))
        throw new Error(`Voyage AI API error: ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return new Float32Array(data.data[0].embedding)
}

/**
 * Generate embedding using local model (fallback option)
 * Uses @xenova/transformers (works in Bun, no Python needed)
 */
async function generateLocalEmbedding(text: string): Promise<Float32Array> {
    try {
        const {pipeline} = await import('@xenova/transformers')

        /*
         * Load model (cached after first load)
         * 384 dimensions
         */
        const extractor = await pipeline('feature-extraction', config.embeddings.local.model || 'Xenova/all-MiniLM-L6-v2')

        // Generate embedding
        const result = await extractor(text, {
            normalize: true,
            pooling: 'mean',
        })

        return new Float32Array(result.data as ArrayLike<number>)
    } catch (error) {
        logger.error('[Embeddings] Failed to generate local embedding:', error)
        throw new Error(`Local embedding generation failed: ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
        })
    }
}

/**
 * Generate embedding using OpenAI API (optional)
 */
async function generateOpenAIEmbedding(text: string): Promise<Float32Array> {
    const apiKey = config.embeddings.openai.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
        throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
        body: JSON.stringify({
            input: text,
            model: config.embeddings.openai.model || 'text-embedding-3-small',
        }),
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        method: 'POST',
    })

    if (!response.ok) {
        const error = await response.json().catch((): {error: {message: string}} => ({error: {message: response.statusText}}))
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return new Float32Array(data.data[0].embedding)
}

/**
 * Generate embeddings for documentation
 * Chunks content and generates embeddings for each chunk
 */
export async function generateDocEmbeddings(docId: string, content: string): Promise<void> {
    // Chunk content
    const chunks = chunkMarkdown(content, config.embeddings.chunkSize || 1000, config.embeddings.chunkOverlap || 200)

    // Generate embeddings for each chunk
    const chunksWithEmbeddings = await Promise.all(
        chunks.map(
            async (chunk): Promise<Chunk & {embedding: Float32Array}> => ({
                ...chunk,
                embedding: await generateEmbedding(chunk.text),
            }),
        ),
    )

    // Store embeddings
    await storeDocEmbeddings(docId, chunksWithEmbeddings)
}

/**
 * Store embeddings in vec0 table
 */
async function storeDocEmbeddings(docId: string, chunks: (Chunk & {embedding: Float32Array})[]): Promise<void> {
    // Delete existing embeddings for this doc
    try {
        getDb().prepare('DELETE FROM vec_content WHERE content_type = ? AND content_id = ?').run('doc', docId)
        getDb().prepare('DELETE FROM documentation_chunks WHERE doc_id = ?').run(docId)
    } catch (error) {
        // Table might not exist yet, that's okay
        logger.warn('[Embeddings] Failed to delete existing embeddings:', error)
    }

    const now = Date.now()

    // Insert embeddings into vec0 table
    for (const chunk of chunks) {
        const chunkId = randomId()
        const embeddingJson = JSON.stringify([...chunk.embedding])
        const metadata = JSON.stringify({
            heading: chunk.heading,
        })

        try {
            /*
             * Insert into vec0 virtual table
             * Note: rowid is auto-generated by SQLite, don't specify it
             */
            getDb()
                .prepare(`
                INSERT INTO vec_content (embedding, content_type, content_id, chunk_index, chunk_text, metadata)
                VALUES (?, 'doc', ?, ?, ?, ?)
            `)
                .run(embeddingJson, docId, chunk.index, chunk.text, metadata)

            // Also store in metadata table
            getDb()
                .prepare(`
                INSERT INTO documentation_chunks (id, doc_id, chunk_index, chunk_text, created_at)
                VALUES (?, ?, ?, ?, ?)
            `)
                .run(chunkId, docId, chunk.index, chunk.text, now)
        } catch (error) {
            logger.error(`[Embeddings] Failed to store embedding for chunk ${chunk.index}:`, error)
            // Continue with other chunks
        }
    }

    logger.info(`[Embeddings] Stored ${chunks.length} embeddings for doc ${docId}`)
}

/**
 * Generate embedding for a ticket
 * Combines title and description into single embedding
 */
export async function generateTicketEmbedding(ticketId: string, title: string, description: string | null): Promise<void> {
    // Combine title and description
    const text = `${title}\n\n${description || ''}`

    // Generate embedding
    const embedding = await generateEmbedding(text)

    // Get workspace name for metadata
    const ticket = getDb().prepare('SELECT repository_id FROM tickets WHERE id = ?').get(ticketId) as
        | {repository_id: string}
        | undefined
    const workspace = ticket
        ? (getDb().prepare('SELECT name FROM repositories WHERE id = ?').get(ticket.repository_id) as {name: string} | undefined)
        : null

    // Get ticket labels
    const labels = getDb().prepare('SELECT label FROM ticket_labels WHERE ticket_id = ?').all(ticketId) as {label: string}[]
    const ticketLabels = labels.map((label): string => label.label)

    // Get ticket status
    const ticketStatus = getDb().prepare('SELECT status FROM tickets WHERE id = ?').get(ticketId) as {status: string} | undefined

    // Store in vec0 table
    const embeddingJson = JSON.stringify([...embedding])
    const metadata = JSON.stringify({
        status: ticketStatus?.status,
        tags: ticketLabels,
        workspace: workspace?.name,
    })

    // Delete existing embedding
    try {
        getDb().prepare('DELETE FROM vec_content WHERE content_type = ? AND content_id = ?').run('ticket', ticketId)
    } catch (error) {
        // Table might not exist yet
        logger.warn('[Embeddings] Failed to delete existing ticket embedding:', error)
    }

    // Insert new embedding
    try {
        const chunkId = randomId()

        /*
         * Note: rowid is auto-generated by SQLite, don't specify it
         * Tickets don't have chunks, so use 0 for chunk_index
         */
        getDb()
            .prepare(`
            INSERT INTO vec_content (embedding, content_type, content_id, chunk_index, chunk_text, metadata)
            VALUES (?, 'ticket', ?, 0, ?, ?)
        `)
            .run(embeddingJson, ticketId, text, metadata)

        // Update metadata table
        const now = Date.now()
        getDb()
            .prepare(`
            INSERT OR REPLACE INTO ticket_embeddings (id, ticket_id, embedding_text, created_at, updated_at)
            VALUES (?, ?, ?,
                COALESCE((SELECT created_at FROM ticket_embeddings WHERE ticket_id = ?), ?),
                ?)
        `)
            .run(chunkId, ticketId, text, ticketId, now, now)

        logger.info(`[Embeddings] Stored embedding for ticket ${ticketId}`)
    } catch (error) {
        logger.error('[Embeddings] Failed to store ticket embedding:', error)
        throw error
    }
}
