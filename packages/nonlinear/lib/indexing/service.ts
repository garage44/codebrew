#!/usr/bin/env bun
/**
 * Indexing Service
 * Separate service that processes indexing jobs from the database
 * Runs independently from the main Nonlinear service
 */

import {initConfig, config} from '../config.ts'
import {initDatabase, db} from '../database.ts'
import {loggerTransports} from '@garage44/common/service'
import {indexCodeFile} from '../docs/code-embeddings.ts'
import {generateDocEmbeddings} from '../docs/embeddings.ts'
import {generateTicketEmbedding} from '../docs/embeddings.ts'

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

class IndexingService {
    private logger: ReturnType<typeof loggerTransports> | null = null

    private maxConcurrent = 3

    // Poll every 5 seconds
    private pollInterval = 5000

    private pollTimer?: ReturnType<typeof setInterval>

    private processing = false

    private running = false

    /**
     * Initialize logger (must be called before start)
     */
    setLogger(loggerInstance: ReturnType<typeof loggerTransports>): void {
        this.logger = loggerInstance
    }

    /**
     * Start the indexing service
     */
    start(): void {
        if (!this.logger) {
            throw new Error('Logger not initialized. Call setLogger() first.')
        }

        if (this.running) {
            this.logger.warn('[IndexingService] Service already running')
            return
        }

        this.running = true
        this.logger.info('[IndexingService] Starting indexing service...')
        this.logger.info(`[IndexingService] Max concurrent jobs: ${this.maxConcurrent}`)
        this.logger.info(`[IndexingService] Poll interval: ${this.pollInterval}ms`)

        // Process immediately
        this.processJobs()

        // Then poll for new jobs
        this.pollTimer = setInterval(() => {
            this.processJobs()
        }, this.pollInterval)

        this.logger.info('[IndexingService] Indexing service started')
    }

    /**
     * Stop the indexing service
     */
    stop(): void {
        if (!this.running) {
            return
        }

        this.running = false
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = undefined
        }

        if (this.logger) {
            this.logger.info('[IndexingService] Indexing service stopped')
        }
    }

    /**
     * Process pending jobs from database
     */
    private async processJobs(): Promise<void> {
        if (this.processing) {
            return
        }

        try {
            // Get pending jobs (limit to maxConcurrent)
            const pendingJobs = db.prepare(`
                SELECT * FROM indexing_jobs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT ?
            `).all(this.maxConcurrent) as IndexingJob[]

            // No jobs to process
            if (pendingJobs.length === 0) {
                return
            }

            this.processing = true

            // Process jobs concurrently
            await Promise.all(pendingJobs.map((job) => this.processJob(job)))

            this.processing = false
        } catch(error) {
            if (this.logger) {
                this.logger.error('[IndexingService] Error processing jobs:', error)
            }
            this.processing = false
        }
    }

    /**
     * Process a single indexing job
     */
    private async processJob(job: IndexingJob): Promise<void> {
        try {
            // Update status to processing
            db.prepare(`
                UPDATE indexing_jobs
                SET status = 'processing', started_at = ?
                WHERE id = ?
            `).run(Date.now(), job.id)

            if (this.logger) {
                this.logger.info(`[IndexingService] Processing job ${job.id} (${job.type})`)
            }

            // Process based on type
            if (job.type === 'code' && job.repositoryId && job.filePath) {
                await indexCodeFile(job.repositoryId, job.filePath)
            } else if (job.type === 'doc' && job.docId) {
                const doc = db.prepare('SELECT * FROM documentation WHERE id = ?').get(job.docId) as {
                    content: string
                } | undefined
                if (doc) {
                    await generateDocEmbeddings(job.docId, doc.content)
                } else {
                    throw new Error(`Document not found: ${job.docId}`)
                }
            } else if (job.type === 'ticket' && job.ticketId) {
                const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(job.ticketId) as {
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
            db.prepare(`
                UPDATE indexing_jobs
                SET status = 'completed', completed_at = ?
                WHERE id = ?
            `).run(Date.now(), job.id)

            if (this.logger) {
                this.logger.info(`[IndexingService] Completed job ${job.id} (${job.type})`)
            }
        } catch(error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            if (this.logger) {
                this.logger.error(`[IndexingService] Failed job ${job.id}:`, errorMsg)
            }

            // Mark failed
            db.prepare(`
                UPDATE indexing_jobs
                SET status = 'failed', error = ?, completed_at = ?
                WHERE id = ?
            `).run(errorMsg, Date.now(), job.id)
        }
    }

    /**
     * Get service status
     */
    getStatus(): {
        failedJobs: number
        pendingJobs: number
        processing: boolean
        processingJobs: number
        running: boolean
    } {
        const pending = db.prepare(`
            SELECT COUNT(*) as count FROM indexing_jobs WHERE status = 'pending'
        `).get() as {count: number}

        const processing = db.prepare(`
            SELECT COUNT(*) as count FROM indexing_jobs WHERE status = 'processing'
        `).get() as {count: number}

        const failed = db.prepare(`
            SELECT COUNT(*) as count FROM indexing_jobs WHERE status = 'failed'
        `).get() as {count: number}

        return {
            failedJobs: failed.count,
            pendingJobs: pending.count,
            processing: this.processing,
            processingJobs: processing.count,
            running: this.running,
        }
    }
}

// Main entry point
if (import.meta.main) {
    const service = new IndexingService();

    // Initialize and start
    (async() => {
        await initConfig(config)
        initDatabase()

        // Initialize logger after config is loaded
        const loggerInstance = loggerTransports(
            config.logger as {file: string; level: 'debug' | 'info' | 'warn' | 'error'},
            'service',
        )
        service.setLogger(loggerInstance)

        // Handle graceful shutdown (after logger is initialized)
        process.on('SIGINT', () => {
            loggerInstance.info('[IndexingService] Received SIGINT, shutting down...')
            service.stop()
            process.exit(0)
        })

        process.on('SIGTERM', () => {
            loggerInstance.info('[IndexingService] Received SIGTERM, shutting down...')
            service.stop()
            process.exit(0)
        })

        service.start()

        // Keep process alive and log status periodically
        /* Log status every minute */
        setInterval(() => {
            const status = service.getStatus()
            loggerInstance.info(
                `[IndexingService] Status: ${status.pendingJobs} pending, ` +
                `${status.processingJobs} processing, ${status.failedJobs} failed`,
            )
        }, 60000)
    })()
}

export {IndexingService}
