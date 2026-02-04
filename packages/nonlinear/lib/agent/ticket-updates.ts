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
 * Broadcast ticket update via WebSocket
 * Used by both updateTicketFromAgent and update_ticket tool
 */
function broadcastTicketUpdate(ticketId: string): void {
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

    broadcastTicketUpdate(ticketId)
}

/**
 * Update ticket fields (used by update_ticket tool)
 * Supports all ticket fields: title, description, status, priority, solution_plan
 */
export async function updateTicketFields(
    ticketId: string,
    updates: {
        title?: string | null
        description?: string | null
        status?: string | null
        priority?: number | null
        solution_plan?: string | null
    },
    agentType?: 'planner' | 'developer' | 'reviewer',
): Promise<{success: boolean; error?: string}> {
    // Validate ticket exists
    const existingTicket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(ticketId)
    if (!existingTicket) {
        return {
            success: false,
            error: `Ticket not found: ${ticketId}`,
        }
    }

    // Validate priority range if provided
    if (updates.priority !== undefined && updates.priority !== null) {
        if (updates.priority < 0 || updates.priority > 10) {
            return {
                success: false,
                error: 'Priority must be between 0 and 10',
            }
        }
    }

    // Validate status if provided
    if (updates.status !== undefined && updates.status !== null) {
        const validStatuses = ['backlog', 'todo', 'in_progress', 'review', 'closed']
        if (!validStatuses.includes(updates.status)) {
            return {
                success: false,
                error: `Invalid status: ${updates.status}. Must be one of: ${validStatuses.join(', ')}`,
            }
        }
    }

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
    if (updates.status !== undefined) {
        fields.push('status = ?')
        values.push(updates.status)
    }
    if (updates.priority !== undefined) {
        fields.push('priority = ?')
        values.push(updates.priority)
    }
    if (updates.solution_plan !== undefined) {
        fields.push('solution_plan = ?')
        values.push(updates.solution_plan)
    }

    if (fields.length === 0) {
        return {
            success: false,
            error: 'No fields to update',
        }
    }

    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(ticketId)

    try {
        db.prepare(`
            UPDATE tickets
            SET ${fields.join(', ')}
            WHERE id = ?
        `).run(...values)

        // Regenerate ticket embedding if title or description changed
        if (updates.title !== undefined || updates.description !== undefined) {
            try {
                const {queueIndexingJob} = await import('../indexing/queue.ts')
                await queueIndexingJob({
                    type: 'ticket',
                    ticketId,
                })
            } catch (error) {
                logger.warn(`[Agent Ticket Updates] Failed to regenerate embedding for ticket ${ticketId}:`, error)
            }
        }

        broadcastTicketUpdate(ticketId)

        return {success: true}
    } catch (error) {
        logger.error(`[Agent Ticket Updates] Failed to update ticket ${ticketId}:`, error)
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
