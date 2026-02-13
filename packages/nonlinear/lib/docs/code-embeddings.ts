/**
 * Code embeddings generation and storage
 */

import {logger} from '../../service.ts'
import {db} from '../database.ts'
import {config} from '../config.ts'
import {generateEmbedding} from './embeddings.ts'
import {type CodeChunk, chunkCode} from './code-chunking.ts'
import {createHash} from 'node:crypto'
import path from 'node:path'

export interface CodeSearchResult {
    chunk_index: number
    chunk_name: string | null
    chunk_text: string
    chunk_type: string
    distance: number
    end_line: number | null
    file_path: string
    repository_id: string
    start_line: number | null
}

/**
 * Calculate file hash for cache invalidation
 */
async function calculateFileHash(filePath: string): Promise<string> {
    const content = await Bun.file(filePath).text()
    return createHash('sha256').update(content).digest('hex')
}

/**
 * Index code file - generates and stores embeddings
 * Called when file is added/changed, NOT during search
 */
export async function indexCodeFile(
    repositoryId: string,
    filePath: string,
): Promise<void> {
    if (!db) {
        throw new Error('Database not initialized')
    }

    try {
        // 1. Read file and calculate hash
        const code = await Bun.file(filePath).text()
        const fileHash = await calculateFileHash(filePath)

        // 2. Check cache (skip if unchanged)
        const cached = db.prepare(`
            SELECT file_hash FROM code_embeddings
            WHERE repository_id = ? AND file_path = ?
            LIMIT 1
        `).get(repositoryId, filePath) as {file_hash: string} | undefined

        if (cached?.file_hash === fileHash) {
            logger.debug(`[CodeEmbeddings] File already indexed: ${filePath}`)
            // Already indexed, skip
            return
        }

        // 3. Delete old embeddings
        db.prepare(`
            DELETE FROM code_embeddings
            WHERE repository_id = ? AND file_path = ?
        `).run(repositoryId, filePath)

        // 4. Chunk code by semantic units
        const chunks = chunkCode(code, filePath)

        // 5. Generate embeddings (default: local provider)
        const chunksWithEmbeddings = await Promise.all(
            chunks.map(async(chunk): Promise<CodeChunk & {embedding: number[]}> => {
                const embedding = await generateEmbedding(chunk.text)
                return {
                    ...chunk,
                    embedding: [...embedding],
                }
            }),
        )

        // 6. Store embeddings
        for (const chunk of chunksWithEmbeddings) {
            try {
                db.prepare(`
                    INSERT INTO code_embeddings (
                        embedding, repository_id, file_path, file_hash,
                        chunk_index, chunk_type, chunk_name, chunk_text,
                        start_line, end_line, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    JSON.stringify(chunk.embedding),
                    repositoryId,
                    filePath,
                    fileHash,
                    chunk.index,
                    chunk.type,
                    chunk.name || null,
                    chunk.text,
                    chunk.startLine,
                    chunk.endLine,
                    JSON.stringify({}),
                )
            } catch(error) {
                logger.error(`[CodeEmbeddings] Failed to store chunk ${chunk.index} for ${filePath}:`, error)
            }
        }

        logger.info(`[CodeEmbeddings] Indexed ${chunks.length} chunks for ${filePath}`)
    } catch(error) {
        logger.error(`[CodeEmbeddings] Failed to index file ${filePath}:`, error)
        throw error
    }
}

/**
 * Search code - uses PRE-STORED embeddings
 * Only generates embedding for the query
 */
export async function searchCode(
    query: string,
    repositoryId: string,
    options?: {fileType?: string; limit?: number},
): Promise<CodeSearchResult[]> {
    if (!db) {
        throw new Error('Database not initialized')
    }

    try {
        // 1. Generate embedding for QUERY (local provider - fast, no network)
        const queryEmbedding = await generateEmbedding(query)
        const embeddingJson = JSON.stringify([...queryEmbedding])

        // 2. Build search query
        let sql = `
            SELECT
                repository_id,
                file_path,
                chunk_index,
                chunk_type,
                chunk_name,
                chunk_text,
                start_line,
                end_line,
                distance
            FROM code_embeddings
            WHERE repository_id = ?
                AND embedding MATCH ?
        `
        const params: (string | number)[] = [repositoryId, embeddingJson]

        if (options?.fileType) {
            sql += ' AND file_path LIKE ?'
            params.push(`%.${options.fileType}`)
        }

        sql += ' ORDER BY distance ASC LIMIT ?'
        params.push(options?.limit || 10)

        // 3. Search against STORED embeddings
        const results = db.prepare(sql).all(...params) as CodeSearchResult[]

        return results
    } catch(error: unknown) {
        logger.error('[CodeEmbeddings] Failed to search code:', error)
        return []
    }
}

/**
 * Find similar code to given code snippet
 */
export async function findSimilarCode(
    code: string,
    repositoryId: string,
    limit = 5,
): Promise<CodeSearchResult[]> {
    // Generate embedding for the code snippet
    const codeEmbedding = await generateEmbedding(code)
    const embeddingJson = JSON.stringify([...codeEmbedding])

    if (!db) {
        throw new Error('Database not initialized')
    }

    try {
        const results = db.prepare(`
            SELECT
                repository_id,
                file_path,
                chunk_index,
                chunk_type,
                chunk_name,
                chunk_text,
                start_line,
                end_line,
                distance
            FROM code_embeddings
            WHERE repository_id = ?
                AND embedding MATCH ?
            ORDER BY distance ASC
            LIMIT ?
        `).all(repositoryId, embeddingJson, limit) as CodeSearchResult[]

        return results
    } catch(error) {
        logger.error('[CodeEmbeddings] Failed to find similar code:', error)
        return []
    }
}
