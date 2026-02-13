/**
 * WebSocket API for user presence and group state
 * Provides real-time updates for connected users and group status
 * Uses REST-like API pattern over WebSocket (same as Expressio)
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {validateRequest} from '../lib/api/validate.ts'
import {GroupIdParamsSchema, JoinGroupRequestSchema, UpdateStatusRequestSchema} from '../lib/schemas/presence.ts'

// groupId -> Set of userIds
interface PresenceState {
    groups: Map<string, Set<string>>
    users: Map<
        string,
        {
            connected: Date
            groupId: string | null
            id: string
            username: string
        }
    >
}

const state: PresenceState = {
    groups: new Map(),
    users: new Map(),
}

export const registerPresenceWebSocket = (wsManager: WebSocketServerManager) => {
    const api = wsManager.api

    /*
     * Clean up presence when a WebSocket connection closes.
     * This ensures users who disconnect (or switch via debug_user) don't remain "online".
     */
    wsManager.on('connection:close', ({userid}: {userid: string}) => {
        /*
         * Check if this user is still connected via another WebSocket
         * (multiple tabs/windows with same user)
         */
        const user = state.users.get(userid)
        if (!user) return

        // Remove user from all groups
        for (const [groupId, members] of state.groups.entries()) {
            if (members.has(userid)) {
                members.delete(userid)
                if (members.size === 0) {
                    state.groups.delete(groupId)
                }

                // Broadcast leave to all clients
                wsManager.broadcast(`/presence/${groupId}/leave`, {
                    groupId,
                    timestamp: Date.now(),
                    userId: userid,
                })
            }
        }

        // Remove from user state
        state.users.delete(userid)

        // Broadcast offline status
        wsManager.broadcast('/users/presence', {
            status: 'offline',
            timestamp: Date.now(),
            userid,
        })
    })

    /**
     * User joins a group
     * POST /api/presence/:groupId/join
     */
    api.post('/api/presence/:groupId/join', async (context, request) => {
        const {groupId} = validateRequest(GroupIdParamsSchema, request.params)
        const {userId, username} = validateRequest(JoinGroupRequestSchema, request.data)

        // Add user to group
        if (!state.groups.has(groupId)) {
            state.groups.set(groupId, new Set())
        }
        state.groups.get(groupId)!.add(userId)

        // Update user state
        state.users.set(userId, {
            connected: new Date(),
            groupId,
            id: userId,
            username,
        })

        // Broadcast to all clients
        wsManager.broadcast(`/presence/${groupId}/join`, {
            groupId,
            timestamp: Date.now(),
            userId,
            username,
        })

        // Return current group members to joining user
        const members = Array.from(state.groups.get(groupId) || [])
            .map((id) => state.users.get(id))
            .filter(Boolean)

        return {
            groupId,
            members,
        }
    })

    /**
     * User leaves a group
     * POST /api/presence/:groupId/leave
     */
    api.post('/api/presence/:groupId/leave', async (context, request) => {
        const {groupId} = request.params
        const {userId} = request.data as {userId?: string}

        if (!userId || typeof userId !== 'string') {
            return {error: 'User ID is required', success: false}
        }

        // Remove user from group
        const group = state.groups.get(groupId)
        if (group) {
            group.delete(userId)
            if (group.size === 0) {
                state.groups.delete(groupId)
            }
        }

        // Update user state
        const user = state.users.get(userId)
        if (user) {
            user.groupId = null
        }

        // Broadcast to all clients
        wsManager.broadcast(`/presence/${groupId}/leave`, {
            groupId,
            timestamp: Date.now(),
            userId,
        })

        return {success: true}
    })

    /**
     * Get current presence for a group
     * GET /api/presence/:groupId/members
     */
    api.get('/api/presence/:groupId/members', async (context, request) => {
        const {groupId} = validateRequest(GroupIdParamsSchema, request.params)

        const members = Array.from(state.groups.get(groupId) || [])
            .map((id) => state.users.get(id))
            .filter(Boolean)

        return {
            groupId,
            members,
        }
    })

    /**
     * Get all online users (presence status)
     * GET /api/presence/users
     */
    // Return all users with their presence status
    api.get('/api/presence/users', async (_context, _request) => {
        const onlineUsers: Record<string, 'online' | 'offline' | 'busy'> = {}

        // All users in presence state are online
        for (const [userId, user] of state.users.entries()) {
            // Check if user has a status property (busy, etc.)
            const userStatus = (user as {status?: 'online' | 'offline' | 'busy'}).status || 'online'
            onlineUsers[userId] = userStatus === 'busy' ? 'busy' : 'online'
        }

        return {
            users: onlineUsers,
        }
    })

    /**
     * Update user status (availability, mic state, etc.)
     * POST /api/presence/:groupId/status
     */
    api.post('/api/presence/:groupId/status', async (context, request) => {
        const {groupId} = validateRequest(GroupIdParamsSchema, request.params)
        const {status, userId} = validateRequest(UpdateStatusRequestSchema, request.data)

        const user = state.users.get(userId)
        if (user) {
            Object.assign(user, status)

            // Broadcast status update
            wsManager.broadcast(`/presence/${groupId}/status`, {
                status,
                timestamp: Date.now(),
                userId,
            })
        }

        return {success: true}
    })
}
