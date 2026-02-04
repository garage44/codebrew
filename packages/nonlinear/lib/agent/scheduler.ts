/**
 * Agent Scheduler
 * Automatically runs agents based on configuration and database state
 */

import {db} from '../database.ts'
import {logger} from '../../service.ts'
import {updateAgentStatus, getAgentStatus} from './status.ts'
import {type AgentContext} from './base.ts'
import {getAgentById} from './index.ts'

/**
 * Initialize agent scheduler
 * @deprecated Agents should be started via AgentService or CLI commands
 * This function is kept for backward compatibility but does nothing
 */
export async function initAgentScheduler() {
    logger.warn('[Agent Scheduler] initAgentScheduler() is deprecated. Use AgentService or CLI commands to start agents.')
}

/**
 * Run an agent
 * Used by AgentService and triggerAgent
 * Now supports task-based context
 */
export async function runAgent(agentId: string, context: Record<string, unknown> = {}): Promise<void> {
    // Load agent from database
    const agentRecord = db.prepare(`
        SELECT id, name, type, enabled, status
        FROM agents
        WHERE id = ?
    `).get(agentId) as {
        enabled: number
        id: string
        name: string
        status: string
        type: 'prioritizer' | 'developer' | 'reviewer'
    } | undefined

    if (!agentRecord) {
        throw new Error(`Agent ${agentId} not found`)
    }

    if (agentRecord.enabled === 0) {
        logger.info(`[Agent Scheduler] Agent ${agentRecord.name} is disabled, skipping`)
        return
    }

    // Check if this is a task-based trigger (has task_id)
    const isTaskTrigger = !!context.task_id
    const taskId = context.task_id as string | undefined

    // If task-based, check if task is already completed or failed (skip those)
    // Note: We allow "processing" status because AgentService marks tasks as processing
    // before calling the scheduler, and AgentService ensures single-task processing
    if (isTaskTrigger && taskId) {
        const task = db.prepare(`
            SELECT status FROM agent_tasks WHERE id = ?
        `).get(taskId) as {status: string} | undefined

        if (task && (task.status === 'completed' || task.status === 'failed')) {
            logger.debug(`[Agent Scheduler] Task ${taskId} is already ${task.status}, skipping`)
            return
        }
    }

    // Check if this is a mention trigger (has comment_id) - allow it even if agent is working
    const isMentionTrigger = !!context.comment_id

    // Check agent status (skip unless it's a mention/task trigger)
    const status = getAgentStatus(agentId)
    if (status && status.status === 'working' && !isMentionTrigger && !isTaskTrigger) {
        logger.debug(`[Agent Scheduler] Agent ${agentRecord.name} is already working, skipping`)
        return
    }

    if (isTaskTrigger) {
        logger.info(`[Agent Scheduler] Task trigger detected - forcing agent ${agentRecord.name} to run`)
    } else if (isMentionTrigger) {
        logger.info(`[Agent Scheduler] Mention trigger detected - forcing agent ${agentRecord.name} to run even if working`)
    }

    // Get agent instance
    const agent = getAgentById(agentId)
    if (!agent) {
        throw new Error(`Failed to create agent instance for ${agentId}`)
    }

    try {
        updateAgentStatus(agentId, 'working')

        logger.info(`[Agent Scheduler] Running agent ${agentRecord.name} (${agentRecord.type})`)
        const result = await agent.process(context as AgentContext)

        if (result.success) {
            updateAgentStatus(agentId, 'idle')
            logger.info(`[Agent Scheduler] Agent ${agentRecord.name} completed: ${result.message}`)
        } else {
            updateAgentStatus(agentId, 'error', null, result.error || 'Unknown error')
            logger.error(`[Agent Scheduler] Agent ${agentRecord.name} failed: ${result.message}`)
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        updateAgentStatus(agentId, 'error', null, errorMsg)
        logger.error(`[Agent Scheduler] Agent ${agentRecord.name} error: ${error}`)
        throw error
    }
}


/**
 * Manually trigger an agent
 */
export async function triggerAgent(agentId: string, context: Record<string, unknown> = {}): Promise<void> {
    // Load agent from database
    const agentRecord = db.prepare(`
        SELECT id, name, enabled
        FROM agents
        WHERE id = ?
    `).get(agentId) as {
        enabled: number
        id: string
        name: string
    } | undefined

    if (!agentRecord) {
        throw new Error(`Agent ${agentId} not found`)
    }

    if (agentRecord.enabled === 0) {
        throw new Error(`Agent ${agentRecord.name} is disabled`)
    }

    return runAgent(agentId, context)
}
