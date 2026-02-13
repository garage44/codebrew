/**
 * Generic Streaming Message Infrastructure
 * Reusable streaming functions for comments, chat, and other message types
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {db} from '../database.ts'
import {randomId} from '@garage44/common/lib/utils'
import {logger} from '../../service.ts'
import type {WebSocketClient} from '@garage44/common/lib/ws-client'

export type StreamingMessageType = 'comment' | 'chat'

export type StreamingMessageStatus = 'generating' | 'completed' | 'failed'

let wsManager: WebSocketServerManager | null = null
let wsClientForBroadcast: WebSocketClient | null = null

/**
 * Initialize streaming infrastructure
 */
export function initStreaming(manager: WebSocketServerManager): void {
    wsManager = manager
    logger.info('[Streaming] Initialized generic streaming infrastructure')
}

/**
 * Set WebSocket client for broadcasting (used by agent services running in separate processes)
 */
export function setBroadcastWebSocketClient(client: WebSocketClient): void {
    wsClientForBroadcast = client
    logger.info('[Streaming] Set WebSocket client for broadcasting')
}

/**
 * Broadcast comment update (works from both main service and agent services)
 */
async function broadcastCommentUpdate(
    commentId: string,
    ticketId: string,
    type: 'created' | 'updated' | 'completed',
): Promise<void> {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as {
        [key: string]: unknown
    } | undefined

    if (!comment) {
        logger.warn(`[Streaming] Comment ${commentId} not found for broadcast`)
        return
    }

    if (wsManager) {
        // We're in the main service process - broadcast directly
        wsManager.broadcast('/tickets', {
            comment,
            ticketId,
            type: `comment:${type}`,
        })
    } else if (wsClientForBroadcast) {
        // We're in an agent service process - request main service to broadcast
        try {
            await wsClientForBroadcast.post(`/api/tickets/${ticketId}/comments/${commentId}/broadcast`, {
                type,
            })
        } catch(error) {
            logger.warn(`[Streaming] Failed to request broadcast: ${error}`)
        }
    } else {
        logger.warn('[Streaming] No WebSocket manager or client available for broadcasting')
    }
}

/**
 * Create a streaming message placeholder
 */
export async function createStreamingMessage(
    type: StreamingMessageType,
    initialContent: string,
    metadata: Record<string, unknown>,
): Promise<string> {
    const messageId = randomId()
    const now = Date.now()

    if (type === 'comment') {
        const ticketId = metadata.ticket_id as string
        const authorType = metadata.author_type as 'agent' | 'human'
        const authorId = metadata.author_id as string
        const respondingTo = metadata.responding_to as string | undefined

        db.prepare(`
            INSERT INTO comments (
                id, ticket_id, author_type, author_id, content,
                status, responding_to, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 'generating', ?, ?, ?)
        `).run(
            messageId,
            ticketId,
            authorType,
            authorId,
            initialContent,
            respondingTo || null,
            now,
            now,
        )

        // Broadcast comment creation
        await broadcastCommentUpdate(messageId, ticketId, 'created')
    } else {
        // Future: chat message handling
        throw new Error(`Streaming message type "${type}" not yet implemented`)
    }

    return messageId
}

/**
 * Update streaming message content
 */
export async function updateStreamingMessage(
    messageId: string,
    content: string,
    isFinal = false,
): Promise<void> {
    const now = Date.now()
    const status: StreamingMessageStatus = isFinal ? 'completed' : 'generating'

    // Determine message type from database
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(messageId) as {
        ticket_id: string
    } | undefined

    if (comment) {
        // Update comment
        db.prepare(`
            UPDATE comments
            SET content = ?, status = ?, updated_at = ?
            WHERE id = ?
        `).run(content, status, now, messageId)

        // Broadcast update
        await broadcastCommentUpdate(messageId, comment.ticket_id, 'updated')
    } else {
        // Future: chat message handling
        throw new Error(`Message ${messageId} not found`)
    }
}

/**
 * Finalize streaming message
 */
export async function finalizeStreamingMessage(
    messageId: string,
    content: string,
): Promise<void> {
    const now = Date.now()

    // Determine message type from database
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(messageId) as {
        ticket_id: string
    } | undefined

    if (comment) {
        // Update comment to final state
        db.prepare(`
            UPDATE comments
            SET content = ?, status = 'completed', updated_at = ?
            WHERE id = ?
        `).run(content, now, messageId)

        // Broadcast completion
        await broadcastCommentUpdate(messageId, comment.ticket_id, 'completed')
    } else {
        // Future: chat message handling
        throw new Error(`Message ${messageId} not found`)
    }
}

/**
 * Get streaming message by ID
 */
export function getStreamingMessage(messageId: string): {
    content: string
    id: string
    status: StreamingMessageStatus
    type: StreamingMessageType
} | null {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(messageId) as {
        content: string
        id: string
        status: string
    } | undefined

    if (comment) {
        return {
            content: comment.content,
            id: comment.id,
            status: comment.status as StreamingMessageStatus,
            type: 'comment',
        }
    }

    // Future: chat message lookup
    return null
}
