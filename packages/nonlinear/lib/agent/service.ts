#!/usr/bin/env bun
/**
 * Agent Service
 * Separate service that runs a single agent in a polling loop
 * Runs independently from the main Nonlinear service
 */

import {initConfig, config} from '../config.ts'
import {initDatabase, db} from '../database.ts'
import {loggerTransports} from '@garage44/common/service'
import {runAgent as runAgentScheduler} from './scheduler.ts'

export interface AgentStatusState {
    agentId: string
    lastError?: string
    lastRun?: number
    running: boolean
}

class AgentService {
    private agentId: string

    private logger: ReturnType<typeof loggerTransports> | null = null

    private pollInterval: number

    private pollTimer?: ReturnType<typeof setInterval>

    private lastError?: string

    private lastRun?: number

    private running = false

    constructor(agentId: string) {
        this.agentId = agentId
        // Load agent config from DB to determine poll interval
        const agentRecord = db.prepare(`
            SELECT type, enabled
            FROM agents
            WHERE id = ?
        `).get(agentId) as {
            enabled: number
            type: 'prioritizer' | 'developer' | 'reviewer'
        } | undefined

        if (!agentRecord) {
            throw new Error(`Agent ${agentId} not found`)
        }

        if (agentRecord.enabled === 0) {
            throw new Error(`Agent ${agentId} is disabled`)
        }

        // Determine poll interval based on agent type
        if (agentRecord.type === 'prioritizer') {
            const agentConfig = config.agents.prioritizer

            /* 5 minutes default */
            this.pollInterval = agentConfig?.checkInterval || 300000
        } else {
            /* Developer and Reviewer check more frequently - 10 seconds */
            this.pollInterval = 10000
        }
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
        this.logger.info(`[AgentService] Poll interval: ${this.pollInterval}ms`)

        // Process immediately
        this.runAgent()

        // Then poll for work
        this.pollTimer = setInterval(() => {
            this.runAgent()
        }, this.pollInterval)

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
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = undefined
        }

        if (this.logger) {
            this.logger.info(`[AgentService] Agent service stopped for agent ${this.agentId}`)
        }
    }

    /**
     * Run the agent
     */
    private async runAgent(): Promise<void> {
        if (!this.logger) {
            return
        }

        try {
            await runAgentScheduler(this.agentId, {})
            this.lastRun = Date.now()
            this.lastError = undefined
        } catch(error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            this.lastError = errorMsg
            this.logger.error(`[AgentService] Error running agent ${this.agentId}: ${errorMsg}`)
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
        console.error('Usage: bun lib/agent/service.ts <agent-id>')
        process.exit(1)
    }

    const service = new AgentService(agentId)

    /* Declare logger here */
    let logger: ReturnType<typeof loggerTransports>;
    (async() => {
        await initConfig(config)
        initDatabase()

        /* Initialize logger after config is loaded */
        logger = loggerTransports(config.logger as {file: string; level: 'debug' | 'info' | 'warn' | 'error'}, 'service')

        service.setLogger(logger)

        /* Handle graceful shutdown */
        process.on('SIGINT', () => {
            logger.info(`[AgentService] Received SIGINT, shutting down agent ${agentId}...`)
            service.stop()
            process.exit(0)
        })

        process.on('SIGTERM', () => {
            logger.info(`[AgentService] Received SIGTERM, shutting down agent ${agentId}...`)
            service.stop()
            process.exit(0)
        })

        service.start()

        /* Keep process alive - log status every minute */
        setInterval(() => {
            const status = service.getStatus()
            logger.debug(`[AgentService] Status: ${JSON.stringify(status)}`)
        }, 60000)
    })()
}

export {AgentService}
