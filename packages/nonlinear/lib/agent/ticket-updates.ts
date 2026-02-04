/**
 * Agent Ticket Update Broadcasting
 * Allows agents to update tickets and broadcast changes via WebSocket
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {db} from '../database.ts'
import {logger} from '../../service.ts'

let wsManager: WebSocketServerManager | null = null

/**
 * Initialize ticket update broadcasting
 */
export function initAgentTicketUpdateBroadcasting(manager: WebSocketServerManager) {
    wsManager = manager
    logger.info('[Agent Ticket Updates] Initialized agent ticket update broadcasting')
}

/**
 * Update a ticket and broadcast the change via WebSocket
 */
export async function updateTicketFromAgent(
    ticketId: string,
    updates: {
        description?: string | null
        solution_plan?: string | null
        title?: string
    },
): Promise<void> {
    const fields: string[] = []
    const values: (string | number | null)[] = []

    if (updates.title !== undefined) {
        fields.push('title = ?')
        values.push(updates.title)
    }
    if (updates.description !== undefined) {
        fields.push('description = ?')
        values.push(updates.description)
    }
    if (updates.solution_plan !== undefined) {
        fields.push('solution_plan = ?')
        values.push(updates.solution_plan)
    }

    if (fields.length === 0) {
        return
    }

    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(ticketId)

    db.prepare(`
        UPDATE tickets
        SET ${fields.join(', ')}
        WHERE id = ?
    `).run(...values)

    const ticket = db.prepare(`
        SELECT t.*, r.name as repository_name
        FROM tickets t
        LEFT JOIN repositories r ON t.repository_id = r.id
        WHERE t.id = ?
    `).get(ticketId) as {
        assignee_id: string | null
        assignee_type: string | null
        branch_name: string | null
        created_at: number
        description: string | null
        id: string
        merge_request_id: string | null
        priority: number | null
        repository_id: string
        repository_name: string | null
        solution_plan: string | null
        status: string
        title: string
        updated_at: number
    } | undefined

    if (!ticket) {
        logger.warn(`[Agent Ticket Updates] Ticket ${ticketId} not found after update`)
        return
    }

    // Broadcast ticket update
    if (wsManager) {
        wsManager.broadcast('/tickets', {
            ticket,
            type: 'ticket:updated',
        })
        logger.info(`[Agent Ticket Updates] Updated and broadcast ticket ${ticketId}`)
    } else {
        logger.warn('[Agent Ticket Updates] WebSocket manager not initialized, ticket updated but not broadcast')
    }
}
