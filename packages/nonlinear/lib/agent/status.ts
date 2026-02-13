/**
 * Agent Status Tracking
 * Tracks agent state and broadcasts status changes via WebSocket
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {logger} from '../../service.ts'
import {getDb} from '../database.ts'

export type AgentStatus = 'idle' | 'working' | 'error' | 'offline'

interface AgentStatusState {
    agentId: string
    currentTicketId: string | null
    error: string | null
    lastActivity: number
    status: AgentStatus
}

const agentStatuses = new Map<string, AgentStatusState>()

let wsManager: WebSocketServerManager | null = null

/**
 * Initialize agent status tracking
 */
export function initAgentStatusTracking(manager: WebSocketServerManager): void {
    wsManager = manager

    // Load existing agent statuses from database
    const agents = getDb().prepare('SELECT id, status FROM agents').all() as {id: string; status: string}[]
    for (const agent of agents) {
        agentStatuses.set(agent.id, {
            agentId: agent.id,
            currentTicketId: null,
            error: null,
            lastActivity: Date.now(),
            status: (agent.status || 'idle') as AgentStatus,
        })
    }

    logger.info('[Agent Status] Initialized agent status tracking')
}

/**
 * Update agent status
 */
export function updateAgentStatus(agentId: string, status: AgentStatus, ticketId?: string | null, error?: string | null): void {
    const currentState = agentStatuses.get(agentId) || {
        agentId,
        currentTicketId: null,
        error: null,
        lastActivity: Date.now(),
        status: 'idle' as AgentStatus,
    }

    const newState: AgentStatusState = {
        agentId,
        currentTicketId: ticketId || currentState.currentTicketId,
        error: error || null,
        lastActivity: Date.now(),
        status,
    }

    agentStatuses.set(agentId, newState)

    // Get agent name for logging
    const agent = getDb().prepare('SELECT name FROM agents WHERE id = ?').get(agentId) as {name: string} | undefined
    const agentName = agent?.name || agentId

    // Update database
    getDb()
        .prepare(`
        UPDATE agents
        SET status = ?
        WHERE id = ?
    `)
        .run(status, agentId)

    // Broadcast status change
    if (wsManager) {
        wsManager.broadcast('/agents', {
            agentId,
            currentTicketId: newState.currentTicketId,
            error: newState.error,
            lastActivity: newState.lastActivity,
            status,
            type: 'agent:status',
        })
    }

    logger.debug(`[Agent Status] Agent ${agentName} (${agentId}) status: ${status}`)
}

/**
 * Get agent status
 */
export function getAgentStatus(agentId: string): AgentStatusState | null {
    return agentStatuses.get(agentId) || null
}

/**
 * Get all agent statuses
 */
export function getAllAgentStatuses(): AgentStatusState[] {
    return [...agentStatuses.values()]
}

/**
 * Clear agent status (when agent stops working)
 */
export function clearAgentStatus(agentId: string): void {
    updateAgentStatus(agentId, 'idle', null, null)
}
