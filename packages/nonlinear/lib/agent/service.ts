#!/usr/bin/env bun
/**
 * Agent Service
 * Separate service that runs a single agent with WebSocket push-based task processing
 * Runs independently from the main Nonlinear service
 */

import {config, initConfig} from '../config.ts'
import {db, initDatabase} from '../database.ts'
import {loggerTransports} from '@garage44/common/service'
import {WebSocketClient} from '@garage44/common/lib/ws-client'
import {runAgent as runAgentScheduler} from './scheduler.ts'
import {
    type TaskData,
    getPendingTasks,
    markTaskCompleted,
    markTaskFailed,
    markTaskProcessing,
} from './tasks.ts'
import {setBroadcastWebSocketClient} from './streaming.ts'

export interface AgentStatusState {
    agentId: string
    lastError?: string
    lastRun?: number
    running: boolean
}

class AgentService {
    private agentId: string

    private logger: ReturnType<typeof loggerTransports> | null = null

    private lastError?: string

    private lastRun?: number

    private processingTask = false

    private taskQueue: {taskData: TaskData; taskId: string}[] = []

    private running = false

    private wsClient: WebSocketClient | null = null

    private wsUrl: string

    constructor(agentId: string) {
        this.agentId = agentId
        // Load agent config from DB
        const agentRecord = db.prepare(`
            SELECT type, enabled
            FROM agents
            WHERE id = ?
        `).get(agentId) as {
            enabled: number
            type: 'planner' | 'developer' | 'reviewer'
        } | undefined

        if (!agentRecord) {
            throw new Error(`Agent ${agentId} not found`)
        }

        if (agentRecord.enabled === 0) {
            throw new Error(`Agent ${agentId} is disabled`)
        }

        // Get WebSocket URL from config or environment
        this.wsUrl = process.env.NONLINEAR_WS_URL || 'ws://localhost:3032/ws'
    }

    /**
     * Initialize logger (must be called before start)
     */
    setLogger(loggerInstance: ReturnType<typeof loggerTransports>): void {
        this.logger = loggerInstance
    }

    /**
     * Start the agent service
     */
    start(): void {
        if (!this.logger) {
            throw new Error('Logger not initialized. Call setLogger() first.')
        }

        if (this.running) {
            this.logger.warn(`[AgentService] Agent ${this.agentId} service already running`)
            return
        }

        this.running = true
        this.logger.info(`[AgentService] Starting agent service for agent ${this.agentId}...`)
        this.logger.info(`[AgentService] WebSocket URL: ${this.wsUrl}`)

        // Initialize WebSocket client
        this.initWebSocket()

        /*
         * Catch up on missed tasks from database (with delay to allow WebSocket to connect)
         * The WebSocket 'open' event will also trigger catch-up, but we do it here too
         * in case WebSocket connection is delayed
         */
        setTimeout((): void => {
            this.catchUpOnTasks().catch((error: unknown): void => {
                this.logger?.error(`[AgentService] Error during catch-up: ${error}`)
            })
            // 1 second delay to allow WebSocket connection to establish
        }, 1000)

        this.logger.info(`[AgentService] Agent service started for agent ${this.agentId}`)
    }

    /**
     * Stop the agent service
     */
    stop(): void {
        if (!this.running) {
            return
        }

        this.running = false

        // Close WebSocket connection
        if (this.wsClient) {
            this.wsClient.close()
            this.wsClient = null
        }

        if (this.logger) {
            this.logger.info(`[AgentService] Agent service stopped for agent ${this.agentId}`)
        }
    }

    /**
     * Initialize WebSocket client and subscribe to task events
     */
    private initWebSocket(): void {
        if (!this.logger) {return}

        this.wsClient = new WebSocketClient(this.wsUrl)

        // Subscribe to agent-specific task topic
        const taskTopic = `/agents/${this.agentId}/tasks`
        this.wsClient.onRoute(taskTopic, async(data: {
            task_data?: TaskData
            task_id?: string
            task_type?: string
        }) => {
            if (!this.logger) {return}

            const taskId = data.task_id as string
            const taskType = data.task_type as string
            const taskData = (data.task_data || data) as TaskData

            if (!taskId) {
                this.logger.warn('[AgentService] Received task event without task_id, ignoring')
                return
            }

            this.logger.info(`[AgentService] Received task ${taskId} (type: ${taskType})`)

            // Add to queue
            this.taskQueue.push({
                taskData: {
                    ...taskData,
                    task_id: taskId,
                    task_type: taskType,
                },
                taskId,
            })

            // Process if not busy
            this.processNextTask()
        })

        // Subscribe to stop topic
        const stopTopic = `/agents/${this.agentId}/stop`
        this.wsClient.onRoute(stopTopic, async(): Promise<void> => {
            if (!this.logger) {return}

            this.logger.info(`[AgentService] Received stop command for agent ${this.agentId}`)

            // Wait for current task to finish if processing
            if (this.processingTask) {
                this.logger.info('[AgentService] Waiting for current task to finish before stopping...')
                // Poll until task is done (max 30 seconds)
                const maxWait = 30_000
                const startTime = Date.now()
                while (this.processingTask && (Date.now() - startTime) < maxWait) {
                    await new Promise<void>((resolve): void => {
                        setTimeout((): void => {
                            resolve()
                        }, 500)
                    })
                }
            }

            // Stop the service
            this.stop()

            // Exit process
            this.logger.info(`[AgentService] Shutting down agent ${this.agentId}`)
            process.exit(0)
        })

        // Handle reconnection
        this.wsClient.on('open', async(): Promise<void> => {
            this.logger?.info(`[AgentService] WebSocket connected to ${this.wsUrl}`)

            // Set WebSocket client for comment broadcasting
            setBroadcastWebSocketClient(this.wsClient)

            // Subscribe to agent task topic
            try {
                await this.wsClient.post(`/api/agents/${this.agentId}/subscribe`, {})
                this.logger?.info(`[AgentService] Subscribed to /agents/${this.agentId}/tasks`)
            } catch(error: unknown) {
                this.logger?.warn(`[AgentService] Failed to subscribe to task topic: ${error}`)
            }

            // Catch up on missed tasks after reconnection
            this.catchUpOnTasks().catch((error: unknown): void => {
                this.logger?.error(`[AgentService] Error during catch-up after reconnect: ${error}`)
            })
        })

        this.wsClient.on('reconnecting', ({attempt}: {attempt: number}): void => {
            this.logger?.warn(`[AgentService] WebSocket reconnecting (attempt ${attempt})`)
            if (attempt >= 5) {
                this.logger?.error(
                    `[AgentService] WebSocket connection failed after ${attempt} attempts. ` +
                    `Make sure the Nonlinear service is running on ${this.wsUrl}`,
                )
            }
        })

        this.wsClient.on('error', (error: unknown): void => {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.logger?.error(`[AgentService] WebSocket error: ${errorMsg}`)
            // Log helpful message if connection fails
            if (errorMsg.includes('Failed to connect') || errorMsg.includes('ECONNREFUSED')) {
                this.logger?.warn(`[AgentService] Cannot connect to ${this.wsUrl}. Make sure the Nonlinear service is running.`)
                this.logger?.warn('[AgentService] Start the service with: bun service.ts start')
            }
        })

        // Connect
        this.wsClient.connect()
    }

    /**
     * Catch up on missed tasks from database
     */
    private async catchUpOnTasks(): Promise<void> {
        if (!this.logger) {return}

        const pendingTasks = getPendingTasks(this.agentId)

        if (pendingTasks.length === 0) {
            // Silently return - no need to log when there are no pending tasks
            return
        }

        this.logger.info(`[AgentService] Found ${pendingTasks.length} pending task(s), processing...`)

        // Add to queue
        for (const task of pendingTasks) {
            const taskData = JSON.parse(task.task_data) as TaskData
            this.taskQueue.push({
                taskData: {
                    ...taskData,
                    task_id: task.id,
                    task_type: task.task_type,
                },
                taskId: task.id,
            })
        }

        // Process first task
        this.processNextTask()
    }

    /**
     * Process next task in queue
     */
    private async processNextTask(): Promise<void> {
        if (!this.logger) {return}

        // Don't process if already processing or queue is empty
        if (this.processingTask || this.taskQueue.length === 0) {
            return
        }

        // Get next task from queue
        const task = this.taskQueue.shift()
        if (!task) {return}

        this.processingTask = true

        try {
            const {taskData, taskId} = task

            this.logger.info(`[AgentService] Processing task ${taskId}`)

            // Mark task as processing
            markTaskProcessing(taskId)

            // Run agent with task context (include task_id for scheduler)
            await runAgentScheduler(this.agentId, {
                ...taskData,
                task_id: taskId,
            })

            // Mark task as completed
            markTaskCompleted(taskId)

            this.lastRun = Date.now()
            this.lastError = undefined
            this.logger.info(`[AgentService] Completed task ${taskId}`)
        } catch(error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.lastError = errorMsg
            this.logger.error(`[AgentService] Error processing task ${task.taskId}: ${errorMsg}`)

            // Mark task as failed
            markTaskFailed(task.taskId, errorMsg)
        } finally {
            this.processingTask = false

            // Process next task if available
            if (this.taskQueue.length > 0) {
                // Small delay to prevent tight loop
                setTimeout((): void => {
                    this.processNextTask()
                }, 100)
            }
        }
    }

    /**
     * Get service status
     */
    getStatus(): AgentStatusState {
        return {
            agentId: this.agentId,
            lastError: this.lastError,
            lastRun: this.lastRun,
            running: this.running,
        }
    }
}

// Main entry point
if (import.meta.main) {
    /* Get agent ID from command line */
    const agentId = process.argv[2]

    if (!agentId) {
        // eslint-disable-next-line no-console
        console.error('Usage: bun lib/agent/service.ts <agent-id>')
        process.exit(1)
    }

    const service = new AgentService(agentId)

    /* Declare logger here */
    let logger: ReturnType<typeof loggerTransports> | null = null
    ;(async(): Promise<void> => {
        await initConfig(config)
        initDatabase()

        /* Initialize logger after config is loaded */
        logger = loggerTransports(config.logger as {file: string; level: 'debug' | 'info' | 'warn' | 'error'}, 'service')

        service.setLogger(logger)

        /* Handle graceful shutdown */
        process.on('SIGINT', (): void => {
            logger.info(`[AgentService] Received SIGINT, shutting down agent ${agentId}...`)
            service.stop()
            process.exit(0)
        })

        process.on('SIGTERM', (): void => {
            logger.info(`[AgentService] Received SIGTERM, shutting down agent ${agentId}...`)
            service.stop()
            process.exit(0)
        })

        service.start()

        /* Keep process alive - log status every minute */
        setInterval((): void => {
            const status = service.getStatus()
            logger.debug(`[AgentService] Status: ${JSON.stringify(status)}`)
        }, 60_000)
    })()
}

export {AgentService}
