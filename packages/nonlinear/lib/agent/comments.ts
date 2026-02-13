/**
 * Agent Comment Broadcasting
 * Allows agents to add comments and broadcast them via WebSocket
 * Uses generic streaming infrastructure for real-time updates
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {logger} from '../../service.ts'
import {getDb} from '../database.ts'
import {createStreamingMessage, finalizeStreamingMessage, initStreaming, updateStreamingMessage} from './streaming.ts'

let wsManager: WebSocketServerManager | null = null

/**
 * Initialize comment broadcasting
 */
export function initAgentCommentBroadcasting(manager: WebSocketServerManager): void {
    wsManager = manager
    initStreaming(manager)
    logger.info('[Agent Comments] Initialized agent comment broadcasting')
}

/**
 * Create a placeholder comment for streaming updates
 * Call this immediately when agent starts processing a task
 */
export async function createAgentCommentPlaceholder(
    ticketId: string,
    agentName: string,
    respondingToCommentId?: string,
): Promise<string> {
    return createStreamingMessage('comment', '', {
        author_id: agentName,
        author_type: 'agent',
        responding_to: respondingToCommentId,
        ticket_id: ticketId,
    })
}

/**
 * Update agent comment content (for streaming)
 * Call this as content is generated
 */
export async function updateAgentComment(commentId: string, content: string, isFinal = false): Promise<void> {
    return updateStreamingMessage(commentId, content, isFinal)
}

/**
 * Finalize agent comment (mark as completed)
 * Call this when comment generation is complete
 */
export async function finalizeAgentComment(commentId: string, content: string): Promise<void> {
    return finalizeStreamingMessage(commentId, content)
}

/**
 * Add a comment to a ticket and broadcast it via WebSocket
 * Legacy function for non-streaming comments (backward compatibility)
 */
export async function addAgentComment(ticketId: string, agentName: string, content: string): Promise<void> {
    // Use streaming infrastructure but mark as completed immediately
    const commentId = await createAgentCommentPlaceholder(ticketId, agentName)
    await finalizeAgentComment(commentId, content)
    logger.info(`[Agent Comments] Added and broadcast comment ${commentId} to ticket ${ticketId}`)
}
