/**
 * Indexing job queue utilities
 * Used by the main service to queue indexing jobs
 * The indexing service processes these jobs
 */

import {db} from '../database.ts'
import {loggerTransports} from '@garage44/common/service'
import type {LoggerConfig} from '@garage44/common/types'
import {config} from '../config.ts'

// Initialize logger
const logger = loggerTransports(config.logger as LoggerConfig, 'service')

export interface IndexingJobInput {
    docId?: string
    filePath?: string
    repositoryId?: string
    ticketId?: string
    type: 'code' | 'doc' | 'ticket'
}

/**
 * Queue an indexing job
 * This only adds the job to the database - the indexing service will process it
 */
export async function queueIndexingJob(job: IndexingJobInput): Promise<string> {
    const jobId = crypto.randomUUID()

    try {
        db.prepare(`
            INSERT INTO indexing_jobs (
                id, type, repository_id, file_path, doc_id, ticket_id,
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            jobId,
            job.type,
            job.repositoryId || null,
            job.filePath || null,
            job.docId || null,
            job.ticketId || null,
            'pending',
            Date.now(),
        )

        logger.debug(`[IndexingQueue] Queued job ${jobId} (${job.type})`)
        return jobId
    } catch(error: unknown) {
        logger.error('[IndexingQueue] Failed to queue job:', error)
        throw error
    }
}

/**
 * Queue multiple code files for indexing
 */
export async function queueCodeFiles(repositoryId: string, filePaths: string[]): Promise<string[]> {
    const jobPromises = filePaths.map(async(filePath): Promise<string> => queueIndexingJob({
            filePath,
            repositoryId,
            type: 'code',
        }))

    const jobIds = await Promise.all(jobPromises)

    logger.info(`[IndexingQueue] Queued ${jobIds.length} code files for indexing`)
    return jobIds
}

/**
 * Get indexing status for a repository
 */
export function getIndexingStatus(repositoryId: string): {
    completed: number
    failed: number
    pending: number
    processing: number
    total: number
} {
    const jobs = db.prepare(`
        SELECT status FROM indexing_jobs
        WHERE repository_id = ?
    `).all(repositoryId) as {status: string}[]

    return {
        completed: jobs.filter((j): boolean => j.status === 'completed').length,
        failed: jobs.filter((j): boolean => j.status === 'failed').length,
        pending: jobs.filter((j): boolean => j.status === 'pending').length,
        processing: jobs.filter((j): boolean => j.status === 'processing').length,
        total: jobs.length,
    }
}
