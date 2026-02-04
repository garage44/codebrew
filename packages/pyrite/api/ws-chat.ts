/**
 * WebSocket API for chat features
 * Provides real-time chat message broadcasting and history sync
 * Uses REST-like API pattern over WebSocket (same as Expressio)
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {userManager} from '@garage44/common/service'
import {ChannelManager} from '../lib/channel-manager.ts'
import {getDatabase} from '../lib/database.ts'
import {logger} from '../service.ts'

let channelManager: ChannelManager | null = null

/**
 * Helper function to get user ID from WebSocket context
 */
async function getUserIdFromContext(
    context: {session?: {userid?: string}},
): Promise<{userId: string | null; username: string | null}> {
    if (!context.session?.userid) {
        return {userId: null, username: null}
    }
    const user = await userManager.getUserByUsername(context.session.userid)
    return {
        userId: user?.id || null,
        username: user?.username || null,
    }
}

export const registerChatWebSocket = (wsManager: WebSocketServerManager) => {
    const api = wsManager.api

    // Initialize channel manager
    if (!channelManager) {
        channelManager = new ChannelManager(getDatabase())
    }

    logger.info('[Chat WebSocket] Registering chat API routes...')

    /**
     * Send a message to a channel
     * POST /channels/:channelSlug/messages
     * Accepts channel slug (matches Galene group name 1:1)
     */
    api.post('/channels/:channelSlug/messages', async(context, request) => {
        try {
            const {channelSlug} = request.params
            const {kind = 'message', message} = request.data as {kind?: string; message?: string}

            if (!channelSlug || typeof channelSlug !== 'string') {
                return {
                    error: 'Invalid channel slug',
                    success: false,
                }
            }

            if (!message || typeof message !== 'string') {
                return {
                    error: 'Message is required',
                    success: false,
                }
            }

            // Ensure kind is a string
            const messageKind: string = typeof kind === 'string' ? kind : 'message'

            // Get user ID and username from context
            const {userId, username} = await getUserIdFromContext(context)

            if (!userId || !username) {
                return {
                    error: 'Authentication required',
                    success: false,
                }
            }

            // Look up channel by slug
            const channel = channelManager!.getChannelBySlug(channelSlug)
            if (!channel) {
                return {
                    error: 'Channel not found',
                    success: false,
                }
            }

            // Check if user can access channel
            if (!channelManager!.canAccessChannel(channel.id, userId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            // Save message to database (use channel.id for foreign key)
            const db = getDatabase()
            const now = Date.now()

            const insertMessage = db.prepare(`
                INSERT INTO messages (channel_id, user_id, username, message, timestamp, kind)
                VALUES (?, ?, ?, ?, ?, ?)
            `)

            const result = insertMessage.run(channel.id, userId, username, message, now, messageKind)
            const messageId = result.lastInsertRowid

            const messageData = {
                channelId: channel.id,
                channelSlug: channel.slug,
                id: messageId,
                kind,
                message,
                timestamp: now,
                userId,
                username,
            }

            // Broadcast to all clients in the channel (use slug in broadcast path)
            wsManager.broadcast(`/channels/${channelSlug}/messages`, messageData)

            const response = {
                message: messageData,
                success: true,
            }
            return response
        } catch(error) {
            logger.error('[Chat API] Error sending message:', error)
            return {
                error: error.message,
                success: false,
            }
        }
    })

    /**
     * Send typing indicator
     * POST /channels/:channelSlug/typing
     * Accepts channel slug (matches Galene group name 1:1)
     */
    api.post('/channels/:channelSlug/typing', async(context, request) => {
        try {
            const {channelSlug} = request.params
            const {typing} = request.data

            if (!channelSlug || typeof channelSlug !== 'string') {
                return {
                    error: 'Invalid channel slug',
                    success: false,
                }
            }

            // Look up channel by slug
            const channel = channelManager!.getChannelBySlug(channelSlug)
            if (!channel) {
                return {
                    error: 'Channel not found',
                    success: false,
                }
            }

            // Get user ID from context
            const {userId} = await getUserIdFromContext(context)

            if (!userId || !channelManager!.canAccessChannel(channel.id, userId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            // Get username from context
            const {username} = await getUserIdFromContext(context)

            // Broadcast to all clients in the channel (use slug in broadcast path)
            wsManager.broadcast(`/channels/${channelSlug}/typing`, {
                timestamp: Date.now(),
                typing,
                userId,
                username: username || 'Unknown',
            })

            return {success: true}
        } catch(error) {
            logger.error('[Chat API] Error sending typing indicator:', error)
            return {
                error: error.message,
                success: false,
            }
        }
    })

    /**
     * Get chat history for a channel
     * GET /channels/:channelSlug/messages
     * Accepts channel slug (matches Galene group name 1:1)
     */
    api.get('/channels/:channelSlug/messages', async(context, request) => {
        try {
            const {channelSlug} = request.params
            const {limit = 100} = (request.data || {}) as {limit?: number}
            
            // Ensure limit is a number
            const messageLimit: number = typeof limit === 'number' ? limit : 100

            if (!channelSlug || typeof channelSlug !== 'string') {
                return {
                    error: 'Invalid channel slug',
                    success: false,
                }
            }

            // Look up channel by slug
            const channel = channelManager!.getChannelBySlug(channelSlug)
            if (!channel) {
                return {
                    error: 'Channel not found',
                    success: false,
                }
            }

            // Get user ID from context
            const {userId} = await getUserIdFromContext(context)

            if (!userId || !channelManager!.canAccessChannel(channel.id, userId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            // Load messages from database (use channel.id for query)
            const db = getDatabase()
            const stmt = db.prepare(`
                SELECT id, channel_id, user_id, username, message, timestamp, kind
                FROM messages
                WHERE channel_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `)

            const messages = stmt.all(channel.id, messageLimit) as Array<{
                channel_id: number
                id: number
                kind: string
                message: string
                timestamp: number
                // TEXT/UUID, not number
                user_id: string
                username: string
            }>

            // Reverse to get chronological order
            messages.reverse()

            return {
                channelId: channel.id,
                channelSlug: channel.slug,
                messages,
                success: true,
            }
        } catch(error) {
            logger.error('[Chat API] Error getting message history:', error)
            return {
                error: error.message,
                success: false,
            }
        }
    })
}
