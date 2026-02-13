import {$s} from '@/app'
import {api, events, notifier, ws} from '@garage44/common/app'
import {logger} from '@garage44/common/lib/logger'
import type {PyriteState} from '@/types'

export function _events() {
    // Implement reactivity for panels.chat collapsed state
    // When chat panel is opened, clear unread count

    events.on('channel', ({action, channelId, channel = null}) => {
        logger.debug('switch chat channel to ', channelId)
        if (action === 'switch') {
            if (!$s.chat.channels[channelId]) {
                $s.chat.channels[channelId] = channel
            }

            selectChannel(channelId)
        }
    })

    events.on('disconnected', () => {
        $s.chat.channels.main.messages = []
        $s.chat.channels.main.unread = 0
    })

    // User left; clean up the channel.
    events.on('user', ({action, user}) => {
        if (action === 'del' && $s.chat.channels[user.id]) {
            // Change the active to-be-deleted channel to main
            if ($s.chat.channel === user.id) {
                selectChannel('main')
            }
            delete $s.chat.channels[user.id]
        }
    })
}

export function closeChannel(channel) {
    selectChannel('main')
    delete $s.chat.channels[channel.id]
}

export function clearChat() {
    logger.debug('clearing chat from remote')
    $s.chat.channels.main.messages = []
}

/**
 * Galene SFU message handler
 * @param {*} sourceId
 * @param {*} destinationId
 * @param {*} nick
 * @param {*} time
 * @param {*} privileged
 * @param {*} history
 * @param {*} kind
 * @param {*} message
 */
export async function onMessage(messageData: {
    sourceId: string
    destinationId: string
    nick: string
    time: number
    privileged: boolean
    history: boolean
    kind: string
    message: string
}) {
    const {sourceId, destinationId, nick, time, privileged, history, kind: messageKind, message} = messageData
    const kind = messageKind || 'default'
    let channelId
    // Incoming message for the main channel
    if (!destinationId) {
        channelId = 'main'
        $s.chat.channels.main.messages.push({kind, message, nick, time})
    }
    // This is a private message
    else if (destinationId && sourceId) {
        channelId = sourceId
        const activeUser = $s.users.find((user) => user.id === sourceId)
        if (activeUser) {
            if (!$s.chat.channels[sourceId]) {
                $s.chat.channels[sourceId] = {
                    id: sourceId,
                    messages: [],
                    name: nick,
                    unread: 0,
                }
            }

            $s.chat.channels[sourceId].messages.push({kind, message, nick, time})
        }
    }

    // Notifies user of a new message when the active channel
    // Is not visible, because the chat panel is closed or a different
    // Channel is active. Not that the chat history is also replayed through
    // OnMessage. This is why no chat channel is selected initially;
    // We don't want to show those messages while entering the group.
    if (
        $s.chat.channels[$s.chat.channel] &&
        ((channelId !== $s.chat.channel) || $s.panels.chat.collapsed)
    ) {
        const channels = $s.chat.channels as PyriteState['chat']['channels']
        channels[channelId].unread += 1
    }

}

export const emojiLookup = new Set()

// Helper function to update user from member data
function updateUserFromMember(member: {user_id: unknown, username?: string, avatar?: string}) {
    const userId = String(member.user_id)
    if ($s.chat.users[userId]) {
        // Update avatar/username if changed
        if (member.avatar) {
            $s.chat.users[userId].avatar = member.avatar
        }
        if (member.username) {
            $s.chat.users[userId].username = member.username
        }
        // Mark as online if in channel
        if (!$s.chat.users[userId].status) {
            $s.chat.users[userId].status = 'online'
        }
    } else {
        $s.chat.users[userId] = {
            avatar: member.avatar,
            status: 'online',
            username: member.username, // Users in channels are online
        }
    }
}

export function selectChannel(channelSlug: string | number) {
    // ChannelSlug can be a channel slug (string) or a legacy numeric ID (for backward compatibility during migration)
    // For non-channel chat (e.g., 'main', user IDs), treat as string
    if (typeof channelSlug === 'string') {
        // Check if it's a Pyrite channel slug (by checking if it exists in channels)
        const channel = $s.channels.find(c => c.slug === channelSlug)
        if (channel) {
            $s.chat.activeChannelSlug = channelSlug
            $s.chat.channel = channelSlug
            // Load channel history
            loadChannelHistory(channelSlug)
        } else {
            // Legacy chat channel (e.g., 'main', user IDs)
            $s.chat.activeChannelSlug = null
            $s.chat.channel = channelSlug
        }
    } else {
        // Legacy numeric ID (during migration)
        $s.chat.activeChannelSlug = null
        $s.chat.channel = channelSlug.toString()
        loadChannelHistory(channelSlug)
    }

    // Clear unread count for the selected channel
    if ($s.chat.channels[$s.chat.channel]) {
        $s.chat.channels[$s.chat.channel].unread = 0
    }
}

// Track ongoing load requests to prevent duplicates
const loadingChannels = new Set<string | number>()

/**
 * Load all users globally from all accessible channels
 */
export async function loadGlobalUsers() {
    try {
        // Initialize global users map if needed
        if (!$s.chat.users) {
            $s.chat.users = {}
        }

        // Load all users from the API to ensure everyone is visible
        try {
            const allUsers = await api.get('/api/users')
            if (Array.isArray(allUsers)) {
                for (const user of allUsers) {
                    if (user.id) {
                        // Normalize user ID to string to prevent duplicates
                        const userId = String(user.id)
                        // Store user globally: userId -> {username, avatar}
                        // Use normalized user ID as key to prevent duplicates
                        $s.chat.users[userId] = {
                            avatar: user.profile?.avatar || '',
                            username: user.username || 'User',
                        }
                    }
                }
            }
        } catch (error) {
            logger.warn('[Chat] Error loading all users from API:', error)
        }

        // Ensure current user is included (in case API didn't return it)
        if ($s.profile.id) {
            const currentUserId = String($s.profile.id)
            if (!$s.chat.users[currentUserId]) {
                $s.chat.users[currentUserId] = {
                    avatar: $s.profile.avatar || '',
                    username: $s.profile.username || 'User',
                }
            }
        }

        // Load presence status for all users
        try {
            const presenceResponse = await ws.get('/api/presence/users')
            if (presenceResponse && presenceResponse.users) {
                for (const [userId, status] of Object.entries(presenceResponse.users)) {
                    const normalizedUserId = String(userId)
                    if ($s.chat.users[normalizedUserId]) {
                        $s.chat.users[normalizedUserId].status = status as 'online' | 'offline' | 'busy'
                    }
                }
            }
        } catch (error) {
            logger.warn('[Chat] Error loading presence status:', error)
        }

        // Also load members from all channels to get real-time presence and update avatars
        if ($s.channels.length) {
            for (const channel of $s.channels) {
                const membersResponse = await ws.get(`/channels/${channel.slug}/members`)
                if (membersResponse && typeof membersResponse === 'object' && 'success' in membersResponse && membersResponse.success && 'members' in membersResponse && Array.isArray(membersResponse.members)) {
                    for (const member of membersResponse.members) {
                        if (member && typeof member === 'object' && 'user_id' in member && member.user_id) {
                            updateUserFromMember({
                                avatar: 'avatar' in member && typeof member.avatar === 'string' ? member.avatar : undefined,
                                user_id: member.user_id,
                                username: 'username' in member && typeof member.username === 'string' ? member.username : undefined,
                            })
                        }
                    }
                }
            }
        }

        // Set offline status for users not in presence
        if ($s.chat.users) {
            for (const userId of Object.keys($s.chat.users)) {
                if (!$s.chat.users[userId].status) {
                    $s.chat.users[userId].status = 'offline'
                }
            }
        }
    } catch (error) {
        logger.error('[Chat] Error loading global users:', error)
    }
}

export async function loadChannelHistory(channelSlug: string | number) {
    // Prevent duplicate requests for the same channel
    if (loadingChannels.has(channelSlug)) {
        logger.debug(`[Chat] Already loading history for channel ${channelSlug}`)
        return
    }

    try {
        loadingChannels.add(channelSlug)
        const channelKey = channelSlug.toString()

        // Pre-create channel entry if it doesn't exist for immediate UI feedback
        if (!$s.chat.channels[channelKey]) {
            $s.chat.channels[channelKey] = {
                id: channelKey,
                messages: [],
                unread: 0
            }
        }

        logger.debug(`[Chat] Loading history for channel ${channelSlug}`)

        // Load channel members first to get avatars
        const membersResponse = await ws.get(`/channels/${channelSlug}/members`)
        const members: Record<string, {avatar: string}> = {}

        if (membersResponse && typeof membersResponse === 'object' && 'success' in membersResponse && membersResponse.success && 'members' in membersResponse && Array.isArray(membersResponse.members)) {
            const chatUsers = $s.chat.users as PyriteState['chat']['users']
            for (const member of membersResponse.members) {
                if (member && typeof member === 'object' && 'user_id' in member && member.user_id && 'avatar' in member) {
                    const userId = String(member.user_id)
                    members[userId] = {avatar: String(member.avatar)}

                    // Also update global users
                    if (!chatUsers) {
                        $s.chat.users = {}
                    }
                    const updatedChatUsers = $s.chat.users as PyriteState['chat']['users']
                    updatedChatUsers[userId] = {
                        avatar: String(member.avatar),
                        username: 'username' in member && typeof member.username === 'string' ? member.username : '',
                    }
                }
            }
        }

        const response = await ws.get(`/channels/${channelSlug}/messages`)

        if (response && typeof response === 'object' && 'success' in response && response.success && 'messages' in response && Array.isArray(response.messages)) {
            // Transform database message format to frontend format
            // DB format: {id, channel_id, user_id, username, message, timestamp, kind}
            // Frontend format: {kind, message, nick, time, user_id}
            const transformedMessages = response.messages.map((msg: any) => ({
                kind: msg.kind || 'message',
                message: msg.message,
                nick: msg.username,
                time: msg.timestamp,
                user_id: msg.user_id,
            }))

            logger.debug(`[Chat] Loaded ${transformedMessages.length} messages for channel ${channelSlug}`)

            // Assign entire array to trigger DeepSignal reactivity
            $s.chat.channels[channelKey].messages = transformedMessages

            // Store members for avatar lookup
            if (!$s.chat.channels[channelKey].members) {
                $s.chat.channels[channelKey].members = {}
            }
            Object.assign($s.chat.channels[channelKey].members, members)
        } else {
            logger.warn(`[Chat] No messages in response for channel ${channelSlug}:`, response)
        }
    } catch (error) {
        logger.error('[Chat] Error loading channel history:', error)
    } finally {
        loadingChannels.delete(channelSlug)
    }
}

/**
 * Send typing indicator for current channel
 */
export async function sendTypingIndicator(typing: boolean, channelSlug?: string) {
    const targetChannelSlug = channelSlug || $s.chat.activeChannelSlug
    if (!targetChannelSlug) {return}

    try {
        await ws.post(`/channels/${targetChannelSlug}/typing`, {
            typing,
        })
    } catch (error) {
        logger.debug('[Chat] Error sending typing indicator:', error)
        // Don't notify user - this is a background operation
    }
}

export async function sendMessage(message: string) {
    if (!$s.chat.activeChannelSlug) {
        notifier.notify({
            level: 'error',
            message: 'No channel selected'
        })
        return
    }

    // Stop typing indicator when message is sent
    await sendTypingIndicator(false, $s.chat.activeChannelSlug)

    const isCommand = message[0] === '/'
    let kind = 'message'

    if (isCommand) {
        if (message.length > 1 && message[1] === '/') {
            message = message.slice(1)
            kind = 'message'
        } else {
            let cmd, rest
            const space = message.indexOf(' ')
            if (space < 0) {
                cmd = message.slice(1)
                rest = ''
            } else {
                cmd = message.slice(1, space)
                rest = message.slice(space + 1)
            }

            if (cmd === 'me') {
                message = rest
                kind = 'me'
            } else {
                notifier.notify({
                    level: 'error',
                    message: `Unknown command /${cmd}, type /help for help`,
                })
                return
            }
        }
    }

    try {
        const response = await ws.post(`/channels/${$s.chat.activeChannelSlug}/messages`, {
            kind,
            message
        })

        if (!response || typeof response !== 'object' || !('success' in response) || !response.success) {
            notifier.notify({
                level: 'error',
                message: (response && typeof response === 'object' && 'error' in response && typeof response.error === 'string' ? response.error : null) || 'Failed to send message'
            })
        }
    } catch (error) {
        logger.error('[Chat] Error sending message:', error)
        notifier.notify({
            level: 'error',
            message: 'Failed to send message'
        })
    }
}

export function unreadMessages() {
    let unread = 0

    const channels = $s.chat.channels as PyriteState['chat']['channels']
    for (const channel of Object.values(channels)) {
        unread += channel.unread
    }
    return unread
}
