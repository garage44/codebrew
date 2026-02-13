/**
 * WebSocket API for channel management
 * Provides CRUD operations for channels and channel membership
 * Uses REST-like API pattern over WebSocket (same as Expressio)
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {userManager} from '@garage44/common/service'

import {validateRequest} from '../lib/api/validate.ts'
import {ChannelManager} from '../lib/channel-manager.ts'
import {getDatabase} from '../lib/database.ts'
import {
    ChannelIdParamsSchema,
    CreateChannelRequestSchema,
    UpdateChannelRequestSchema,
    AddChannelMemberRequestSchema,
    ChannelMemberParamsSchema,
} from '../lib/schemas/channels.ts'
import {syncUsersToGalene} from '../lib/sync.ts'
import {logger} from '../service.ts'

let channelManager: ChannelManager | null = null

/**
 * Helper function to get user ID from WebSocket context
 */
async function getUserIdFromContext(context: {session?: {userid?: string}}): Promise<string | null> {
    if (!context.session?.userid) {
        return null
    }
    const user = await userManager.getUserByUsername(context.session.userid)
    return user?.id || null
}

export const registerChannelsWebSocket = (wsManager: WebSocketServerManager) => {
    const api = wsManager.api

    // Initialize channel manager
    if (!channelManager) {
        channelManager = new ChannelManager(getDatabase())
    }

    /**
     * List channels that the user has access to
     * GET /api/channels
     */
    api.get('/channels', async (context, _request) => {
        try {
            // Get user ID from context (context.session.userid contains username)
            let userId: string | null = null
            logger.debug(`[Channels API] Getting channels, session.userid: ${context.session?.userid}`)

            if (context.session?.userid) {
                const user = await userManager.getUserByUsername(context.session.userid)
                if (user) {
                    userId = user.id
                    logger.debug(`[Channels API] Found user: ${user.username}, ID: ${userId}`)
                } else {
                    logger.warn(`[Channels API] User not found for username: ${context.session.userid}`)
                }
            } else {
                logger.warn('[Channels API] No session.userid found in context')
            }

            // If no authenticated user, return empty channels
            if (!userId) {
                logger.warn('[Channels API] No authenticated user, returning empty channels')
                return {
                    channels: [],
                    success: true,
                }
            }

            const allChannels = await channelManager!.listChannels()
            logger.debug(`[Channels API] Found ${allChannels.length} total channels`)
            const accessibleChannels = []

            for (const channel of allChannels) {
                const canAccess = channelManager!.canAccessChannel(channel.id, userId)
                logger.debug(`[Channels API] Channel ${channel.id} (${channel.name}): canAccess=${canAccess}`)
                if (canAccess) {
                    accessibleChannels.push(channel)
                }
            }

            logger.debug(`[Channels API] Returning ${accessibleChannels.length} accessible channels for user ${userId}`)
            return {
                channels: accessibleChannels,
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error listing channels:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    /**
     * Create a new channel
     * POST /api/channels
     */
    api.post('/channels', async (context, request) => {
        try {
            const {description, galeneGroup, name} = validateRequest(CreateChannelRequestSchema, request.data)

            // Get user ID from context (context.session.userid contains username)
            const creatorId = await getUserIdFromContext(context)

            if (!creatorId) {
                return {
                    error: 'Authentication required',
                    success: false,
                }
            }

            const channel = await channelManager!.createChannel(name, galeneGroup, description || '', creatorId)

            // Sync channel to Galene group file
            try {
                await channelManager!.syncChannelToGalene(channel)
            } catch (syncError) {
                logger.error('[Channels API] Failed to sync channel to Galene (channel still created):', syncError)
                // Continue even if sync fails - channel is still created
            }

            // Broadcast channel creation to all users
            wsManager.broadcast('/channels/created', {
                channel,
                timestamp: Date.now(),
            })

            return {
                channel,
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error creating channel:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    /**
     * Get a specific channel
     * GET /api/channels/:channelId
     */
    api.get('/channels/:channelId', async (context, request) => {
        try {
            const {channelId: channelIdNum} = validateRequest(ChannelIdParamsSchema, request.params)

            // Get user ID from context
            const userId = await getUserIdFromContext(context)

            if (!userId) {
                return {
                    error: 'Authentication required',
                    success: false,
                }
            }

            if (!channelManager!.canAccessChannel(channelIdNum, userId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            const channel = channelManager!.getChannel(channelIdNum)

            if (!channel) {
                return {
                    error: 'Channel not found',
                    success: false,
                }
            }

            return {
                channel,
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error getting channel:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    /**
     * Update a channel
     * PUT /api/channels/:channelId
     */
    api.put('/channels/:channelId', async (context, request) => {
        try {
            const {channelId: channelIdNum} = validateRequest(ChannelIdParamsSchema, request.params)
            const updates = validateRequest(UpdateChannelRequestSchema, request.data)

            // Get user ID from context
            const userId = await getUserIdFromContext(context)

            if (!userId || !channelManager!.canAccessChannel(channelIdNum, userId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            // Get old channel to check if slug changed
            const oldChannel = channelManager!.getChannel(channelIdNum)
            const oldSlug = oldChannel?.slug

            const channel = await channelManager!.updateChannel(channelIdNum, updates)

            if (!channel) {
                return {
                    error: 'Channel not found',
                    success: false,
                }
            }

            // Handle slug changes - rename old group file and create/update new one
            if (updates.slug !== undefined && oldSlug && oldSlug !== channel.slug) {
                try {
                    // Delete old group file
                    await channelManager!.deleteGaleneGroup(oldSlug)
                    logger.info(`[Channels API] Deleted old Galene group file for renamed channel: ${oldSlug} -> ${channel.slug}`)
                } catch (deleteError) {
                    logger.warn(`[Channels API] Failed to delete old Galene group file "${oldSlug}":`, deleteError)
                    // Continue even if old file deletion fails
                }
            }

            // Sync channel to Galene group file
            try {
                await channelManager!.syncChannelToGalene(channel)
            } catch (syncError) {
                logger.error('[Channels API] Failed to sync channel to Galene (channel still updated):', syncError)
                // Continue even if sync fails - channel is still updated
            }

            // Broadcast channel update to all users
            wsManager.broadcast(`/channels/${channelIdNum}/updated`, {
                channel,
                timestamp: Date.now(),
            })

            return {
                channel,
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error updating channel:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    /**
     * Delete a channel
     * DELETE /api/channels/:channelId
     */
    api.delete('/channels/:channelId', async (context, request) => {
        try {
            const {channelId: channelIdNum} = validateRequest(ChannelIdParamsSchema, request.params)

            // Get user ID from context
            const userId = await getUserIdFromContext(context)

            if (!userId || !channelManager!.canAccessChannel(channelIdNum, userId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            // Get channel before deletion to get slug for Galene group deletion
            const channel = channelManager!.getChannel(channelIdNum)
            const channelSlug = channel?.slug

            const success = await channelManager!.deleteChannel(channelIdNum)

            if (!success) {
                return {
                    error: 'Channel not found',
                    success: false,
                }
            }

            // Delete corresponding Galene group file
            if (channelSlug) {
                try {
                    await channelManager!.deleteGaleneGroup(channelSlug)
                } catch (deleteError) {
                    logger.error(`[Channels API] Failed to delete Galene group file for channel "${channelSlug}":`, deleteError)
                    // Continue even if Galene file deletion fails - channel is still deleted
                }
            }

            // Broadcast channel deletion to all users
            wsManager.broadcast(`/channels/${channelIdNum}/deleted`, {
                channelId: channelIdNum,
                timestamp: Date.now(),
            })

            return {
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error deleting channel:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    /**
     * Add a user to a channel
     * POST /api/channels/:channelId/members
     */
    api.post('/channels/:channelId/members', async (context, request) => {
        try {
            const {channelId: channelIdNum} = validateRequest(ChannelIdParamsSchema, request.params)
            const {role, userId} = validateRequest(AddChannelMemberRequestSchema, request.data)

            // Get current user ID from session/context and check admin permissions
            const currentUserId = await getUserIdFromContext(context)
            if (!currentUserId) {
                return {
                    error: 'Authentication required',
                    success: false,
                }
            }

            if (!channelManager!.canAccessChannel(channelIdNum, currentUserId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            const success = await channelManager!.addMember(channelIdNum, userId, role)

            if (!success) {
                return {
                    error: 'Failed to add member',
                    success: false,
                }
            }

            // Sync users to Galene (group files need updated user list)
            try {
                await syncUsersToGalene()
            } catch (syncError) {
                logger.error('[Channels API] Failed to sync users to Galene after adding member:', syncError)
                // Continue even if sync fails - member is still added
            }

            // Broadcast membership change to all users
            wsManager.broadcast(`/channels/${channelIdNum}/members`, {
                action: 'added',
                channelId: channelIdNum,
                role,
                timestamp: Date.now(),
                userId,
            })

            return {
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error adding member:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    /**
     * Remove a user from a channel
     * DELETE /api/channels/:channelId/members/:userId
     */
    api.delete('/channels/:channelId/members/:userId', async (context, request) => {
        try {
            const {channelId: channelIdNum, userId} = validateRequest(ChannelMemberParamsSchema, request.params)

            // Get current user ID from session/context and check admin permissions
            const currentUserId = await getUserIdFromContext(context)
            if (!currentUserId) {
                return {
                    error: 'Authentication required',
                    success: false,
                }
            }

            if (!channelManager!.canAccessChannel(channelIdNum, currentUserId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            // RemoveMember expects userId as string, not number
            const success = await channelManager!.removeMember(channelIdNum, userId)

            if (!success) {
                return {
                    error: 'Failed to remove member',
                    success: false,
                }
            }

            // Sync users to Galene (group files need updated user list)
            try {
                await syncUsersToGalene()
            } catch (syncError) {
                logger.error('[Channels API] Failed to sync users to Galene after removing member:', syncError)
                // Continue even if sync fails - member is still removed
            }

            // Broadcast membership change to all users
            wsManager.broadcast(`/channels/${channelIdNum}/members`, {
                action: 'removed',
                channelId: channelIdNum,
                timestamp: Date.now(),
                userId,
            })

            return {
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error removing member:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    /**
     * Get channel members
     * GET /api/channels/:channelSlug/members
     * Accepts channel slug (matches Galene group name 1:1)
     */
    api.get('/channels/:channelSlug/members', async (context, request) => {
        try {
            const {channelSlug} = request.params

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
            const userId = await getUserIdFromContext(context)

            if (!userId) {
                return {
                    error: 'Authentication required',
                    success: false,
                }
            }

            if (!channelManager!.canAccessChannel(channel.id, userId)) {
                return {
                    error: 'Access denied',
                    success: false,
                }
            }

            const members = channelManager!.getChannelMembers(channel.id)

            return {
                members,
                success: true,
            }
        } catch (error) {
            logger.error('[Channels API] Error getting members:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })
}
