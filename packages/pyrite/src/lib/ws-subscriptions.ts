/**
 * WebSocket client subscriptions for real-time features
 * Uses Expressio's REST-like WebSocket API pattern (ws.post/get + ws.on for broadcasts)
 */

import {events, logger, ws} from '@garage44/common/app'
import {effect} from '@preact/signals'

import type {PyriteState} from '@/types'

import {$s} from '@/app'

// Flag to prevent infinite loops in reactive deduplication
let isDeduplicating = false

/**
 * Remove duplicate users from $s.users array based on normalized user ID
 * Keeps the first occurrence of each user
 * This function is called immediately after any operation that modifies $s.users
 */
function deduplicateUsers(): void {
    // Prevent re-entry to avoid infinite loops
    if (isDeduplicating) {
        return
    }
    if (!$s.users || $s.users.length === 0) {
        return
    }

    isDeduplicating = true
    try {
        const seenIds = new Set<string>()
        const uniqueUsers: typeof $s.users = []
        let duplicateCount = 0

        for (const user of $s.users) {
            if (user && user.id) {
                const normalizedId = String(user.id).trim()
                if (normalizedId) {
                    if (seenIds.has(normalizedId)) {
                        duplicateCount += 1
                        logger.debug(
                            `[deduplicateUsers] Removing duplicate user: ${normalizedId} (${user.username || 'unknown'})`,
                        )
                    } else {
                        seenIds.add(normalizedId)
                        uniqueUsers.push(user)
                    }
                }
            }
        }

        // Only update if we found duplicates (prevents unnecessary reactivity triggers)
        if (duplicateCount > 0) {
            logger.info(
                `[deduplicateUsers] Removed ${duplicateCount} duplicate(s) from users list (${$s.users.length} -> ${uniqueUsers.length})`,
            )
            $s.users = uniqueUsers
        }
    } finally {
        isDeduplicating = false
    }
}

/**
 * Initialize all WebSocket subscriptions
 * Called after WebSocket connection is established
 */
export const initWebSocketSubscriptions = (): void => {
    logger.info('Initializing WebSocket subscriptions')

    // Set up reactive deduplication - watches $s.users and removes duplicates automatically
    effect((): void => {
        // Access $s.users to track changes
        const {users} = $s
        if (users && users.length > 0) {
            // Deduplicate whenever users array changes
            deduplicateUsers()
        }
    })

    // Listen for broadcasts from backend
    initChatSubscriptions()
    initPresenceSubscriptions()
    initGroupSubscriptions()

    logger.info('WebSocket subscriptions initialized')
}

/**
 * Chat WebSocket subscriptions
 * Listen for broadcasts from backend
 */
const initChatSubscriptions = (): void => {
    // Listen for incoming chat messages (broadcast from backend)
    events.on('app:init', (): void => {
        /*
         * Use onRoute for dynamic channel message broadcasts
         * Since URLs are dynamic (/channels/general/messages, /channels/dev/messages, etc.),
         * we use the generic message handler but with better pattern matching
         */
        ws.on('message', (message): void => {
            if (!message || !message.url) {
                return
            }

            /*
             * Check if this is a channel message broadcast
             * Match slug pattern (alphanumeric, hyphens, underscores)
             */
            const messageUrlMatch = message.url.match(/^\/channels\/([a-zA-Z0-9_-]+)\/messages$/)
            if (messageUrlMatch) {
                const channelSlug = messageUrlMatch[1]
                const {data} = message

                if (!data || !channelSlug) {
                    logger.warn('[Chat WS] Invalid message data:', message)
                    return
                }

                const {kind, message: messageText, timestamp, userId, username} = data

                if (!messageText || !username) {
                    logger.warn('[Chat WS] Missing required message fields:', data)
                    return
                }

                logger.debug(`[Chat WS] Received message for channel ${channelSlug}:`, {messageText, username})

                // Find or create the chat channel (use slug as key)
                const channelKey = channelSlug
                // Type assertion: DeepSignal unwraps Signals at runtime
                const channels = $s.chat.channels as PyriteState['chat']['channels']
                if (!channels[channelKey]) {
                    channels[channelKey] = {
                        id: channelKey,
                        messages: [],
                        unread: 0,
                    }
                    logger.debug(`[Chat WS] Created channel entry for ${channelKey}`)
                }

                // Ensure user is in global users map for avatar lookup
                if (userId && username) {
                    if (!$s.chat.users) {
                        $s.chat.users = {}
                    }
                    // Get avatar from channel members if available, or use placeholder
                    const channel = channels[channelKey]
                    const memberAvatar = channel?.members?.[userId]?.avatar

                    const users = $s.chat.users
                    const existingUser = users?.[userId] as
                        | {avatar?: string; username: string; status?: string}
                        | undefined
                    if (existingUser) {
                        // Update username/avatar if they changed
                        existingUser.username = username
                        if (memberAvatar) {
                            existingUser.avatar = memberAvatar
                        }
                    } else if (users) {
                        ;(users as Record<string, {avatar?: string; username: string; status?: string}>)[userId] = {
                            avatar: memberAvatar || 'placeholder-1.png',
                            username,
                        }
                    }
                }

                // Add message to channel - DeepSignal will trigger reactivity
                // Include user_id for avatar lookup
                const newMessage = {
                    kind: kind || 'message',
                    message: messageText,
                    nick: username,
                    time: timestamp || Date.now(),
                    user_id: userId,
                }

                // Push to array - DeepSignal tracks array mutations
                const channel = channels[channelKey]
                channel.messages.push(newMessage)

                logger.debug(`[Chat WS] Added message to channel ${channelKey}, total messages: ${channel.messages.length}`)

                // Increment unread count if not the active channel
                if ($s.chat.activeChannelSlug !== channelSlug) {
                    channel.unread += 1
                }
            }

            /*
             * Check if this is a typing indicator broadcast
             * Match slug pattern (alphanumeric, hyphens, underscores)
             */
            const typingUrlMatch = message.url.match(/^\/channels\/([a-zA-Z0-9_-]+)\/typing$/)
            if (typingUrlMatch) {
                const channelSlug = typingUrlMatch[1]
                const {data} = message
                const {typing, userId, username} = data || {}

                if (userId) {
                    const channelKey = channelSlug

                    // Ensure channel exists
                    const channels = $s.chat.channels as PyriteState['chat']['channels']
                    if (!channels[channelKey]) {
                        channels[channelKey] = {
                            id: channelKey,
                            messages: [],
                            typing: {},
                            unread: 0,
                        }
                    } else if (!channels[channelKey].typing) {
                        channels[channelKey].typing = {}
                    }

                    // Update typing state for this user in this channel
                    if (typing) {
                        if (!channels[channelKey].typing) {
                            channels[channelKey].typing = {}
                        }
                        channels[channelKey].typing[userId] = {
                            timestamp: Date.now(),
                            userId,
                            username: username || 'Unknown',
                        }
                    } else if (channels[channelKey].typing) {
                        // Remove typing indicator when user stops typing
                        const {typing} = channels[channelKey]
                        if (typing && typeof typing === 'object') {
                            // eslint-disable-next-line no-dynamic-delete
                            delete typing[userId]
                        }
                    }
                }
            }
        })
    })
}

/**
 * Presence WebSocket subscriptions
 * Listen for broadcasts from backend
 */
const initPresenceSubscriptions = (): void => {
    events.on('app:init', (): void => {
        // User joined group (broadcast from backend)
        ws.on('/presence/:groupId/join', (data): void => {
            const {groupId, timestamp, userId, username} = data

            logger.debug(`User ${username} joined group ${groupId}`)

            // Update presence status in chat.users
            if ($s.chat.users && userId) {
                const normalizedUserId = String(userId)
                if ($s.chat.users[normalizedUserId]) {
                    $s.chat.users[normalizedUserId].status = 'online'
                }
            }

            // Update current group member count if relevant
            const sfuChannels = $s.sfu.channels as PyriteState['sfu']['channels']
            if (sfuChannels[groupId]) {
                sfuChannels[groupId].clientCount = (sfuChannels[groupId].clientCount || 0) + 1
            }

            /*
             * If this is the current group, add user to users list
             * Note: Skip if this is the current user joining (they're already added via joinGroup response)
             */
            if ($s.sfu.channel.name === groupId) {
                // Normalize userId to string for consistent comparison
                if (!userId) {
                    logger.warn('[Presence] Skipping user add: invalid userId')
                    return
                }
                const normalizedUserId = String(userId).trim()
                const isCurrentUser = $s.profile.id && String($s.profile.id).trim() === normalizedUserId

                // Skip adding current user - they're already added via joinGroup() response
                if (isCurrentUser) {
                    logger.debug(`[Presence] Skipping current user ${normalizedUserId} - already added via joinGroup response`)
                    return
                }

                const userIndex = $s.users.findIndex(
                    (usr): boolean => Boolean(usr && usr.id && String(usr.id).trim() === normalizedUserId),
                )
                if (userIndex === -1) {
                    // User doesn't exist, add it
                    $s.users.push({
                        data: {
                            availability: {id: 'available'},
                            mic: true,
                            raisehand: false,
                        },
                        id: normalizedUserId,
                        permissions: {
                            op: false,
                            present: false,
                            record: false,
                        },
                        username,
                    })
                    // Always deduplicate after any modification (safety net)
                    deduplicateUsers()
                } else {
                    // User already exists, log and skip to prevent duplicate
                    logger.debug(`[Presence] User ${normalizedUserId} already exists in users list, skipping add`)
                }
            }
        })

        // User left group (broadcast from backend)
        ws.on('/presence/:groupId/leave', (data): void => {
            const {groupId, timestamp, userId} = data

            logger.debug(`User ${userId} left group ${groupId}`)

            // Update presence status in chat.users (check if user is still in any group)
            if ($s.chat.users && userId) {
                const normalizedUserId = String(userId)

                /*
                 * Note: We don't set offline here because user might be in another group
                 * The presence API will handle this
                 */
            }

            // Update current group member count if relevant
            const sfuChannelsLeave = $s.sfu.channels as PyriteState['sfu']['channels']
            if (sfuChannelsLeave[groupId] && (sfuChannelsLeave[groupId].clientCount || 0) > 0) {
                sfuChannelsLeave[groupId].clientCount = (sfuChannelsLeave[groupId].clientCount || 0) - 1
            }

            // If this is the current group, remove user from users list
            if ($s.sfu.channel.name === groupId) {
                // Normalize userId to string for consistent comparison
                const normalizedUserId = String(userId).trim()
                const userIndex = $s.users.findIndex(
                    (usr): boolean => Boolean(usr && usr.id && String(usr.id).trim() === normalizedUserId),
                )
                if (userIndex !== -1) {
                    $s.users.splice(userIndex, 1)
                }
            }
            // Always deduplicate after any modification (safety net)
            deduplicateUsers()
        })

        // User status update (broadcast from backend)
        ws.on('/presence/:groupId/status', (data): void => {
            const {status, timestamp, userId} = data

            // Update presence status in chat.users
            if ($s.chat.users && userId) {
                const normalizedUserId = String(userId)
                // Update status if provided in the status object
                if ($s.chat.users[normalizedUserId] && status && typeof status === 'object' && 'status' in status) {
                    $s.chat.users[normalizedUserId].status = status.status as 'online' | 'offline' | 'busy'
                }
            }

            // Normalize userId to string for consistent comparison
            const normalizedUserId = String(userId).trim()
            const user = $s.users.find(
                (usr): boolean => Boolean(usr && usr.id && String(usr.id).trim() === normalizedUserId),
            )
            if (user && status !== null && typeof status === 'object') {
                Object.assign(user.data as Record<string, unknown>, status as Record<string, unknown>)
            }
            // Always deduplicate after any modification (safety net)
            deduplicateUsers()
        })

        // Listen for user presence updates (from /users/presence broadcast)
        ws.on('/users/presence', (data): void => {
            const {status, timestamp, userid} = data

            if ($s.chat.users && userid) {
                const normalizedUserId = String(userid)
                if ($s.chat.users[normalizedUserId]) {
                    $s.chat.users[normalizedUserId].status = status as 'online' | 'offline' | 'busy'
                }
            }
        })
    })
}

/**
 * Group state WebSocket subscriptions
 * Listen for broadcasts from backend
 */
const initGroupSubscriptions = (): void => {
    events.on('app:init', (): void => {
        // Group lock status changed (broadcast from backend)
        ws.on('/groups/:groupId/lock', (data): void => {
            const {locked, reason, timestamp} = data
            // Extracted from broadcast
            const {groupId} = data

            logger.debug(`Group ${groupId} lock status: ${locked}`)

            // Update channel data
            const sfuChannelsLock = $s.sfu.channels as PyriteState['sfu']['channels']
            if (sfuChannelsLock[groupId]) {
                sfuChannelsLock[groupId].locked = locked
            }

            // If this is the current group, update state
            if ($s.sfu.channel.name === groupId) {
                $s.sfu.channel.locked = locked
            }
        })

        // Recording status changed (broadcast from backend)
        ws.on('/groups/:groupId/recording', (data): void => {
            const {recording, recordingId, timestamp} = data
            const {groupId} = data

            logger.debug(`Group ${groupId} recording status: ${recording}`)

            // Update current group recording state
            if ($s.sfu.channel.name === groupId) {
                $s.sfu.channel.recording = recording
            }
        })

        // Group configuration updated (broadcast from backend)
        ws.on('/groups/:groupId/config', (data): void => {
            const {config, timestamp} = data
            const {groupId} = data

            logger.debug(`Group ${groupId} config updated`)

            // Update channel data
            if ($s.sfu.channels[groupId]) {
                Object.assign($s.sfu.channels[groupId], config)
            }
        })

        // Group created or deleted (broadcast from backend)
        ws.on('/groups/update', (data): void => {
            const {action, group, groupId, timestamp} = data

            logger.debug(`Group ${groupId} ${action}`)

            const sfuChannelsUpdate = $s.sfu.channels as PyriteState['sfu']['channels']
            if (action === 'created' && group) {
                // Add new group to channels if it doesn't exist
                if (!sfuChannelsUpdate[groupId]) {
                    sfuChannelsUpdate[groupId] = {
                        audio: false,
                        connected: false,
                        video: false,
                    }
                }
                // Update group metadata
                Object.assign(sfuChannelsUpdate[groupId], {
                    clientCount: group.clientCount,
                    comment: group.comment,
                    description: group.description,
                    locked: group.locked,
                })
            } else if (action === 'deleted' && sfuChannelsUpdate[groupId]) {
                /*
                 * Note: We don't delete from sfu.channels to preserve audio/video state
                 * Only clear group metadata, keep audio/video preferences
                 */
                // eslint-disable-next-line no-dynamic-delete
                delete sfuChannelsUpdate[groupId].locked
                // eslint-disable-next-line no-dynamic-delete
                delete sfuChannelsUpdate[groupId].clientCount
                // eslint-disable-next-line no-dynamic-delete
                delete sfuChannelsUpdate[groupId].comment
                // eslint-disable-next-line no-dynamic-delete
                delete sfuChannelsUpdate[groupId].description
            }
        })

        // Operator action (broadcast from backend)
        ws.on('/groups/:groupId/op-action', (data): void => {
            const {action, actionData, targetUserId, timestamp} = data
            const {groupId} = data

            if ($s.sfu.channel.name !== groupId) {
                return
            }

            logger.debug(`Operator action in group ${groupId}: ${action}`)

            // Normalize targetUserId to string for consistent comparison
            const normalizedTargetUserId = String(targetUserId).trim()
            const targetUser = $s.users.find(
                (usr): boolean => Boolean(usr && usr.id && String(usr.id).trim() === normalizedTargetUserId),
            )

            switch (action) {
                case 'kick': {
                    // Remove kicked user
                    if (String(targetUserId) === String($s.profile.id)) {
                        // Current user was kicked, disconnect
                        const channelSlug = $s.sfu.channel.name || $s.chat.activeChannelSlug
                        $s.sfu.channel.connected = false
                        $s.sfu.channel.name = ''

                        // Update channel connection state
                        const sfuChannelsKick = $s.sfu.channels as PyriteState['sfu']['channels']
                        if (channelSlug && sfuChannelsKick[channelSlug]) {
                            sfuChannelsKick[channelSlug].connected = false
                        }
                    } else if (targetUser) {
                        // Another user was kicked
                        const userIndex = $s.users.findIndex(
                            (usr): boolean =>
                                Boolean(usr && usr.id && String(usr.id).trim() === normalizedTargetUserId),
                        )
                        if (userIndex !== -1) {
                            $s.users.splice(userIndex, 1)
                        }
                    }
                    break
                }


                case 'mute': {
                    // Mute user's microphone
                    if (String(targetUserId) === String($s.profile.id)) {
                        $s.devices.mic.enabled = false
                    } else if (targetUser && 'data' in targetUser && targetUser.data && typeof targetUser.data === 'object') {
                        ;(targetUser.data as {mic?: boolean}).mic = false
                    }
                    break
                }


                case 'op':
                case 'unop': {
                    // Update operator permissions
                    if (
                        targetUser &&
                        'permissions' in targetUser &&
                        targetUser.permissions &&
                        typeof targetUser.permissions === 'object'
                    ) {
                        ;(targetUser.permissions as {op?: boolean}).op = action === 'op'
                    }
                    if (String(targetUserId) === String($s.profile.id)) {
                        $s.permissions.op = action === 'op'
                    }
                    break
                }


                case 'present':
                case 'unpresent': {
                    // Update presenter permissions
                    if (
                        targetUser &&
                        'permissions' in targetUser &&
                        targetUser.permissions &&
                        typeof targetUser.permissions === 'object'
                    ) {
                        ;(targetUser.permissions as {present?: boolean}).present = action === 'present'
                    }
                    if (String(targetUserId) === String($s.profile.id)) {
                        $s.permissions.present = action === 'present'
                    }
                    break
                }


                default: {
                    logger.warn(`[handleGroupAction] Unknown action: ${action}`)
                    break
                }

            }
        })
    })
}

/**
 * Send chat message via WebSocket (using REST-like API)
 */
export const sendChatMessage = (message: string, kind = 'message'): void => {
    if (!$s.sfu.channel.name) {
        return
    }

    ws.post(`/api/chat/${$s.sfu.channel.name}/message`, {
        kind,
        message,
        nick: $s.profile.username,
    })
}

/**
 * Send typing indicator
 */
export const sendTypingIndicator = (typing: boolean): void => {
    if (!$s.sfu.channel.name || !$s.profile.id) {
        return
    }

    ws.post(`/api/chat/${$s.sfu.channel.name}/typing`, {
        typing,
        userId: $s.profile.id,
    })
}

/**
 * Join a group (announce presence)
 */
export const joinGroup = async (groupId: string): Promise<void> => {
    if (!$s.profile.id || !$s.profile.username) {
        return
    }

    const response = await ws.post(`/api/presence/${groupId}/join`, {
        userId: $s.profile.id,
        username: $s.profile.username,
    })

    // Response contains current members list
    if (response && typeof response === 'object' && 'members' in response && Array.isArray(response.members)) {
        /*
         * Clear existing users for this group first to avoid stale data
         * Then add all current members
         */
        const currentGroupId = $s.sfu.channel.name
        if (currentGroupId === groupId) {
            // Remove users that are no longer in the group (keep only current members)
            const memberIds = new Set(
                response.members
                    .filter((mem): boolean => mem && typeof mem === 'object' && 'id' in mem && mem.id)
                    .map((mem): string => String((mem as {id: unknown}).id).trim()),
            )

            // Filter out users not in current members list
            $s.users = $s.users.filter((usr): boolean => {
                if (!usr || !usr.id) {
                    return false
                }
                const normalizedId = String(usr.id).trim()
                return memberIds.has(normalizedId)
            })

            // Add/update all current members
            for (const member of response.members) {
                // Normalize member.id to string for consistent comparison
                if (member && member.id) {
                    const normalizedMemberId = String(member.id).trim()
                    const userIndex = $s.users.findIndex(
                        (usr): boolean => Boolean(usr && usr.id && String(usr.id).trim() === normalizedMemberId),
                    )
                    if (userIndex === -1) {
                        // User doesn't exist, add it
                        $s.users.push({
                            data: {
                                availability: {id: 'available'},
                                mic: true,
                                raisehand: false,
                            },
                            id: normalizedMemberId,
                            permissions: {
                                op: false,
                                present: false,
                                record: false,
                            },
                            username: member.username,
                        })
                    } else if (member.username && $s.users[userIndex].username !== member.username) {
                        // User exists, update username if changed
                        $s.users[userIndex].username = member.username
                    }
                } else {
                    logger.warn('[joinGroup] Skipping member: invalid member data')
                }
            }
            // Ensure no duplicates exist (safety net)
            deduplicateUsers()
        }
    }
}

/**
 * Leave a group (remove presence)
 */
export const leaveGroup = (groupId: string): void => {
    if (!$s.profile.id) {
        return
    }

    ws.post(`/api/presence/${groupId}/leave`, {
        userId: $s.profile.id,
    })
}

/**
 * Query presence for a group
 */
export const queryGroupPresence = async (groupId: string): Promise<unknown[]> => {
    const response = await ws.get(`/api/presence/${groupId}/members`, {})
    return response && typeof response === 'object' && 'members' in response && Array.isArray(response.members)
        ? response.members
        : []
}
