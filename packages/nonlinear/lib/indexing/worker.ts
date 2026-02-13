/**
 * Background indexing worker
 * Processes indexing jobs asynchronously without blocking
 */

import {logger} from '../../service.ts'
import {getDb} from '../database.ts'
import {indexCodeFile} from '../docs/code-embeddings.ts'
import {generateDocEmbeddings, generateTicketEmbedding} from '../docs/embeddings.ts'

export interface IndexingJob {
    completed_at?: number
    created_at: number
    docId?: string
    error?: string
    filePath?: string
    id: string
    repositoryId?: string
    started_at?: number
    status: 'pending' | 'processing' | 'completed' | 'failed'
    ticketId?: string
    type: 'code' | 'doc' | 'ticket'
}

class IndexingWorker {
    private queue: IndexingJob[] = []

    private processing = false

    private maxConcurrent = 3

    /**
     * Add indexing job to queue
     */
    async addJob(job: Omit<IndexingJob, 'id' | 'status' | 'created_at'>): Promise<string> {
        const indexingJob: IndexingJob = {
            ...job,
            created_at: Date.now(),
            id: crypto.randomUUID(),
            status: 'pending',
        }

        // Store in database
        getDb().prepare(`
            INSERT INTO indexing_jobs (
                id, type, repository_id, file_path, doc_id, ticket_id,
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            indexingJob.id,
            indexingJob.type,
            indexingJob.repositoryId || null,
            indexingJob.filePath || null,
            indexingJob.docId || null,
            indexingJob.ticketId || null,
            indexingJob.status,
            indexingJob.created_at,
        )

        this.queue.push(indexingJob)
        this.processQueue() // Start processing if not already running

        return indexingJob.id
    }

    /**
     * Process queue (non-blocking)
     */
    private async processQueue(): Promise<void> {
        if (this.processing) {
            return
        }
        this.processing = true

        while (this.queue.length > 0) {
            const jobs = this.queue.splice(0, this.maxConcurrent)
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(jobs.map((job): Promise<void> => this.processJob(job)))
        }

        this.processing = false
    }

    /**
     * Process a single indexing job
     */
    private async processJob(job: IndexingJob): Promise<void> {
        try {
            // Update status to processing
            getDb().prepare(`
                UPDATE indexing_jobs
                SET status = 'processing', started_at = ?
                WHERE id = ?
            `).run(Date.now(), job.id)

            // Process based on type
            if (job.type === 'code' && job.repositoryId && job.filePath) {
                await indexCodeFile(job.repositoryId, job.filePath)
            } else if (job.type === 'doc' && job.docId) {
                const doc = getDb().prepare('SELECT * FROM documentation WHERE id = ?').get(job.docId) as {
                    content: string
                } | undefined
                if (doc) {
                    await generateDocEmbeddings(job.docId, doc.content)
                } else {
                    throw new Error(`Document not found: ${job.docId}`)
                }
            } else if (job.type === 'ticket' && job.ticketId) {
                const ticket = getDb().prepare('SELECT * FROM tickets WHERE id = ?').get(job.ticketId) as {
                    description: string | null
                    title: string
                } | undefined
                if (ticket) {
                    await generateTicketEmbedding(job.ticketId, ticket.title, ticket.description)
                } else {
                    throw new Error(`Ticket not found: ${job.ticketId}`)
                }
            } else {
                throw new Error(`Invalid job parameters for type ${job.type}`)
            }

            // Mark complete
            getDb().prepare(`
                UPDATE indexing_jobs
                SET status = 'completed', completed_at = ?
                WHERE id = ?
            `).run(Date.now(), job.id)

            logger.info(`[IndexingWorker] Completed job ${job.id} (${job.type})`)
        } catch(error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            logger.error(`[IndexingWorker] Failed job ${job.id}:`, errorMsg)

            // Mark failed
            getDb().prepare(`
                UPDATE indexing_jobs
                SET status = 'failed', error = ?, completed_at = ?
                WHERE id = ?
            `).run(errorMsg, Date.now(), job.id)
        }
    }

    /**
     * Get indexing status for a repository
     */
    getStatus(repositoryId: string): {
        completed: number
        failed: number
        pending: number
        processing: number
        total: number
    } {
        const jobs = getDb().prepare(`
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
}

export const indexingWorker = new IndexingWorker()
