import {userManager} from '@garage44/common/service'

import {validateRequest} from '../lib/api/validate.ts'
import {ChannelManager} from '../lib/channel-manager.ts'
import {getDatabase} from '../lib/database.ts'
import {Router} from '../lib/middleware.ts'
import {ChannelIdPathSchema, CreateChannelHttpRequestSchema, UpdateChannelRequestSchema} from '../lib/schemas/channels.ts'
import {logger} from '../service.ts'

let channelManager: ChannelManager | null = null

export default async function apiChannels(router: Router) {
    // Initialize channel manager
    if (!channelManager) {
        channelManager = new ChannelManager(getDatabase())
    }

    /**
     * List all channels the user has access to
     * GET /api/channels
     */
    router.get('/api/channels', async (req, params, session) => {
        try {
            // Get user ID from session (session.userid contains username)
            let userId: string | null = null
            if (session?.userid) {
                const user = await userManager.getUserByUsername(session.userid)
                if (user) {
                    userId = user.id
                }
            }

            // If no authenticated user, return empty channels
            if (!userId) {
                return new Response(
                    JSON.stringify({
                        channels: [],
                        success: true,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                    },
                )
            }

            const allChannels = await channelManager!.listChannels()
            const accessibleChannels = []

            for (const channel of allChannels) {
                if (channelManager!.canAccessChannel(channel.id, userId)) {
                    accessibleChannels.push(channel)
                }
            }

            return new Response(JSON.stringify(accessibleChannels), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            logger.error('[Channels API] Error listing channels:', error)
            return new Response(
                JSON.stringify({
                    error: error.message,
                    success: false,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                },
            )
        }
    })

    /**
     * Get a specific channel
     * GET /api/channels/:channelId
     */
    router.get('/api/channels/:channelId', async (req, params, session) => {
        try {
            const {param0: channelId} = validateRequest(ChannelIdPathSchema, params)

            // Get user ID from session (session.userid contains username)
            let userId: string | null = null
            if (session?.userid) {
                const user = await userManager.getUserByUsername(session.userid)
                if (user) {
                    userId = user.id
                }
            }

            if (!userId || !channelManager!.canAccessChannel(channelId, userId)) {
                return new Response(
                    JSON.stringify({
                        error: 'Access denied',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 403,
                    },
                )
            }

            const channel = await channelManager!.getChannel(channelId)

            if (!channel) {
                return new Response(
                    JSON.stringify({
                        error: 'Channel not found',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 404,
                    },
                )
            }

            return new Response(
                JSON.stringify({
                    channel,
                    success: true,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                },
            )
        } catch (error) {
            logger.error('[Channels API] Error getting channel:', error)
            return new Response(
                JSON.stringify({
                    error: error.message,
                    success: false,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                },
            )
        }
    })

    /**
     * Create a new channel
     * POST /api/channels
     */
    router.post('/api/channels', async (req, params, session) => {
        try {
            // Get user ID from session (session.userid contains username)
            let userId: string | null = null
            if (session?.userid) {
                const user = await userManager.getUserByUsername(session.userid)
                if (user) {
                    userId = user.id
                }
            }

            if (!userId) {
                return new Response(
                    JSON.stringify({
                        error: 'Unauthorized',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 401,
                    },
                )
            }

            const body = await req.json()
            const {description, is_default, name, slug} = validateRequest(CreateChannelHttpRequestSchema, body)

            // Check if channel with same slug already exists
            const existingChannel = channelManager!.getChannelBySlug(slug)
            if (existingChannel) {
                return new Response(
                    JSON.stringify({
                        error: 'Channel with this slug already exists',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 409,
                    },
                )
            }

            // Create channel
            const channel = await channelManager!.createChannel(name, slug, description || '', userId, is_default === true)

            // Sync to Galene group
            await channelManager!.syncChannelToGalene(channel)

            return new Response(JSON.stringify(channel), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            logger.error('[Channels API] Error creating channel:', error)
            return new Response(
                JSON.stringify({
                    error: error instanceof Error ? error.message : 'Failed to create channel',
                    success: false,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                },
            )
        }
    })

    /**
     * Update a channel
     * PUT /api/channels/:channelId
     */
    router.put('/api/channels/:channelId', async (req, params, session) => {
        try {
            const {param0: channelId} = validateRequest(ChannelIdPathSchema, params)

            // Get user ID from session
            let userId: string | null = null
            if (session?.userid) {
                const user = await userManager.getUserByUsername(session.userid)
                if (user) {
                    userId = user.id
                }
            }

            if (!userId) {
                return new Response(
                    JSON.stringify({
                        error: 'Unauthorized',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 401,
                    },
                )
            }

            // Check if user is admin of the channel
            const userRole = channelManager!.getUserRole(channelId, userId)
            if (userRole !== 'admin') {
                return new Response(
                    JSON.stringify({
                        error: 'Access denied - admin role required',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 403,
                    },
                )
            }

            const body = await req.json()
            const updates = validateRequest(UpdateChannelRequestSchema, body)
            // Convert is_default boolean to number if present
            if (body.is_default !== undefined && updates.is_default === undefined) {
                updates.is_default = body.is_default === true ? 1 : 0
            }

            // If slug is being changed, check if new slug already exists
            if (updates.slug) {
                const existingChannel = channelManager!.getChannelBySlug(updates.slug)
                if (existingChannel && existingChannel.id !== channelId) {
                    return new Response(
                        JSON.stringify({
                            error: 'Channel with this slug already exists',
                            success: false,
                        }),
                        {
                            headers: {'Content-Type': 'application/json'},
                            status: 409,
                        },
                    )
                }
            }

            const updatedChannel = await channelManager!.updateChannel(channelId, updates)

            if (!updatedChannel) {
                return new Response(
                    JSON.stringify({
                        error: 'Channel not found',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 404,
                    },
                )
            }

            // Sync to Galene group
            await channelManager!.syncChannelToGalene(updatedChannel)

            return new Response(JSON.stringify(updatedChannel), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            logger.error('[Channels API] Error updating channel:', error)
            return new Response(
                JSON.stringify({
                    error: error instanceof Error ? error.message : 'Failed to update channel',
                    success: false,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                },
            )
        }
    })

    /**
     * Delete a channel
     * DELETE /api/channels/:channelId
     */
    router.delete('/api/channels/:channelId', async (req, params, session) => {
        try {
            const {param0: channelId} = validateRequest(ChannelIdPathSchema, params)

            // Get user ID from session
            let userId: string | null = null
            if (session?.userid) {
                const user = await userManager.getUserByUsername(session.userid)
                if (user) {
                    userId = user.id
                }
            }

            if (!userId) {
                return new Response(
                    JSON.stringify({
                        error: 'Unauthorized',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 401,
                    },
                )
            }

            // Check if user is admin of the channel
            const userRole = channelManager!.getUserRole(channelId, userId)
            if (userRole !== 'admin') {
                return new Response(
                    JSON.stringify({
                        error: 'Access denied - admin role required',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 403,
                    },
                )
            }

            const channel = channelManager!.getChannel(channelId)
            if (!channel) {
                return new Response(
                    JSON.stringify({
                        error: 'Channel not found',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 404,
                    },
                )
            }

            // Delete Galene group file first
            await channelManager!.deleteGaleneGroup(channel.slug)

            // Delete channel from database
            const deleted = await channelManager!.deleteChannel(channelId)

            if (!deleted) {
                return new Response(
                    JSON.stringify({
                        error: 'Failed to delete channel',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 500,
                    },
                )
            }

            return new Response(
                JSON.stringify({
                    success: true,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                },
            )
        } catch (error) {
            logger.error('[Channels API] Error deleting channel:', error)
            return new Response(
                JSON.stringify({
                    error: error instanceof Error ? error.message : 'Failed to delete channel',
                    success: false,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                },
            )
        }
    })

    /**
     * Get the default channel
     * GET /api/channels/default
     */
    router.get('/api/channels/default', async (req, params, session) => {
        try {
            // Get user ID from session
            let userId: string | null = null
            if (session?.userid) {
                const user = await userManager.getUserByUsername(session.userid)
                if (user) {
                    userId = user.id
                }
            }

            if (!userId) {
                return new Response(
                    JSON.stringify({
                        error: 'Unauthorized',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 401,
                    },
                )
            }

            const defaultChannel = channelManager!.getDefaultChannel()

            if (!defaultChannel) {
                return new Response(
                    JSON.stringify({
                        channel: null,
                        success: true,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                    },
                )
            }

            // Check if user can access the default channel
            if (!channelManager!.canAccessChannel(defaultChannel.id, userId)) {
                return new Response(
                    JSON.stringify({
                        channel: null,
                        success: true,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                    },
                )
            }

            return new Response(
                JSON.stringify({
                    channel: defaultChannel,
                    success: true,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                },
            )
        } catch (error) {
            logger.error('[Channels API] Error getting default channel:', error)
            return new Response(
                JSON.stringify({
                    error: error.message,
                    success: false,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                },
            )
        }
    })

    /**
     * Sync all channels to Galene groups
     * POST /api/channels/sync
     */
    router.post('/api/channels/sync', async (req, params, session) => {
        try {
            // Get user ID from session
            let userId: string | null = null
            if (session?.userid) {
                const user = await userManager.getUserByUsername(session.userid)
                if (user) {
                    userId = user.id
                }
            }

            if (!userId) {
                return new Response(
                    JSON.stringify({
                        error: 'Unauthorized',
                        success: false,
                    }),
                    {
                        headers: {'Content-Type': 'application/json'},
                        status: 401,
                    },
                )
            }

            // Sync all channels to Galene
            const result = await channelManager!.syncAllChannelsToGalene()

            return new Response(
                JSON.stringify({
                    failed: result.failed,
                    success: result.success,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                },
            )
        } catch (error) {
            logger.error('[Channels API] Error syncing channels:', error)
            return new Response(
                JSON.stringify({
                    error: error instanceof Error ? error.message : 'Failed to sync channels',
                    success: false,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                },
            )
        }
    })
}
