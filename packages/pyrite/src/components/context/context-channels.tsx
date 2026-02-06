import classnames from 'classnames'
import {getAvatarUrl} from '@garage44/common/lib/avatar'
import {Link, route} from 'preact-router'
import {useEffect, useMemo, useRef} from 'preact/hooks'
import {$s} from '@/app'
import {$t, ws, logger} from '@garage44/common/app'
import {loadGlobalUsers} from '@/models/chat'
import {Icon} from '@garage44/common/components'
import type {Channel} from '../../types.ts'

// Helper function outside component to avoid recreation
const channelLink = (channelSlug: string) => {
    return `/channels/${channelSlug}`
}

export default function ChannelsContext() {
    const intervalRef = useRef<number | null>(null)

    /*
     * Compute currentChannel directly - DeepSignal is reactive, so accessing
     * $s.chat.activeChannelSlug and $s.channels in render makes it reactive
     */
    const currentChannel = $s.chat.activeChannelSlug ?
            $s.channels.find((c) => c.slug === $s.chat.activeChannelSlug) :
        null

    const pollChannels = async() => {
        try {
            const response = await ws.get('/channels')
            if (response.success) {
                $s.channels = response.channels as Channel[]
                // Load all users globally after channels are loaded
                await loadGlobalUsers()
            }
        } catch(error) {
            logger.error('[ChannelsContext] Error polling channels:', error)
        }
    }

    const setAutofocus = () => {
        $s.login.autofocus = true
    }

    const updateRoute = () => {
        $s.login.autofocus = false

        // Get current pathname to avoid redirecting away from valid routes
        const currentPath = window.location.pathname

        // Don't redirect if we're on a protected route (settings, login, etc.)
        const protectedRoutes = ['/settings']
        if (protectedRoutes.some((route) => currentPath.startsWith(route))) {
            return
        }

        if ($s.chat.activeChannelSlug) {
            // Update the channel route when the user sets the active channel
            route(`/channels/${$s.chat.activeChannelSlug}`, true)
        } else if (currentPath === '/' || currentPath.startsWith('/channels/')) {
            /*
             * Only redirect to home if we're already on home or a channel route
             * This prevents redirecting away from /settings or other routes
             */
            route('/', true)
        }
    }

    // Watch active channel changes - but only update route when channel changes, not on initial mount
    useEffect(() => {
        /*
         * Don't call updateRoute on mount - let the router handle the current URL
         * Only update route when activeChannelSlug actually changes
         */
        if ($s.chat.activeChannelSlug !== null && $s.chat.activeChannelSlug !== undefined) {
            logger.debug(`updating channel route: ${$s.chat.activeChannelSlug}`)
            updateRoute()
        }
    }, [])

    // Setup polling
    useEffect(() => {
        intervalRef.current = setInterval(pollChannels, 3000) as unknown as number
        pollChannels()

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current)
            }
        }
    }, [])

    return (
        <section class={classnames('c-channels-context presence', {collapsed: $s.panels.context.collapsed})}>
            <div class='channels-section'>
                <div class='channels-header'>
                    <span class='channels-title'>Channels</span>
                </div>
                <div class='channels-list'>
                    {$s.channels.map((channel) => {
                        const channelKey = channel.slug
                        const channelData = $s.chat.channels[channelKey]
                        const unreadCount = channelData?.unread || 0
                        const hasUnread = unreadCount > 0

                        return (
                            <Link
                                {...({
                                    class: classnames('channel item', {
                                        active: currentChannel?.slug === channel.slug,
                                        'has-unread': hasUnread,
                                    }),
                                    href: channelLink(channel.slug),
                                    onClick: () => {
                                        $s.chat.activeChannelSlug = channel.slug
                                        setAutofocus()
                                    },
                                } as Record<string, unknown>)}
                                key={channel.id}
                            >
                                <Icon name='chat' type='info' />
                                <div class='flex-column'>
                                    <div class='name'>
                                        #
{channel.name}
                                    </div>
                                    {channel.description &&
                                        <div class='item-properties'>
                                            {channel.description}
                                        </div>}
                                </div>
                            </Link>
                        )
                    })}

                    {!$s.channels.length &&
                        <div class='channel item no-presence'>
                            <div class='name'>
                                {$t('channel.no_channels')}
                            </div>
                        </div>}
                </div>
            </div>

            {/* People List Section */}
            <div class='people-section'>
                <div class='people-header'>
                    <span class='people-title'>People</span>
                </div>
                <div class='people-list'>
                    {(() => {
                        // Get all chat users from global users map and deduplicate by ID
                        const chatUsers = $s.chat.users ? Object.entries($s.chat.users) : []

                        // Deduplicate by converting IDs to strings and using a Set
                        const seenIds = new Set<string>()
                        const uniqueUsers = chatUsers.filter(([userId, _userInfo]) => {
                            const idStr = String(userId)
                            if (seenIds.has(idStr)) {
                                return false
                            }
                            seenIds.add(idStr)
                            return true
                        })

                        if (uniqueUsers.length === 0) {
                            return (
                                <div class='person item no-presence'>
                                    <span class='person-name'>No users found</span>
                                </div>
                            )
                        }

                        return uniqueUsers.map(([userId, userInfo]) => {
                            // Extract user info - handle both Signal and plain object types
                            const user = typeof userInfo === 'object' && userInfo !== null &&
                                'avatar' in userInfo && 'username' in userInfo ?
                                userInfo as {avatar: string; status?: 'busy' | 'offline' | 'online'; username: string} :
                                    {avatar: '', status: 'offline' as const, username: ''}
                            const avatarUrl = getAvatarUrl(user.avatar, String(userId))
                            const isCurrentUser = String($s.profile.id) === String(userId)
                            const status = user.status || 'offline'
                            const statusClass = status === 'online' ? 'online' : status === 'busy' ? 'busy' : 'offline'

                            return (
<div class='person item' key={String(userId)}>
                                <span class={`status-indicator ${statusClass}`} />
                                <img alt={user.username} class='person-avatar' src={avatarUrl} />
                                <span class='person-name'>
                                    {user.username || $t('user.anonymous')}
                                    {isCurrentUser &&
                                        <span class='you-label'>
{' '}
(
{$t('user.you')}
)
                                        </span>}
                                </span>
</div>
                            )
                        })
                    })()}
                </div>
            </div>
        </section>
    )
}
