import {$s} from '@/app'
import {api, ws, notifier, logger, store} from '@garage44/common/app'
import {Router, Route, route} from 'preact-router'
import {mergeDeep} from '@garage44/common/lib/utils'
import {Login, Notifications, AppLayout, PanelMenu, UserMenu, IconLogo} from '@garage44/common/components'
import {useEffect} from 'preact/hooks'
import {Link} from 'preact-router'
import {emojiLookup} from '@/models/chat'
import classnames from 'classnames'
import ChannelsContext from '../context/context-channels'
import {Channel} from '../channel/channel'
import Settings from '../settings/settings'
import UsersFormWrapper from '../settings/users-form-wrapper'
import ChannelsFormWrapper from '../settings/channels-form-wrapper'
import {PanelContextSfu} from '../panel-context-sfu'

export const Main = () => {
    useEffect(() => {
        (async() => {
            // Store previous user ID to detect changes (for debug_user switching)
            const previousUserId = $s.profile.id

            const context = await api.get('/api/context')
            mergeDeep($s.admin, context)

            /*
             * Set profile data from context (username, id, avatar, displayName, password)
             * This ensures profile is populated on page load when user is already authenticated
             */
            if (context.authenticated && context.username) {
                $s.profile.username = context.username
                if (context.id) {
                    $s.profile.id = context.id
                }
                if (context.password) {
                    $s.profile.password = context.password
                }
                if (context.profile) {
                    $s.profile.avatar = context.profile.avatar || 'placeholder-1.png'
                    $s.profile.displayName = context.profile.displayName || context.username || 'User'
                }
            }

            if (context.authenticated) {
                // Detect user change (debug_user switching) - disconnect old connections before reconnecting
                const currentUserId = context.id || $s.profile.id
                const userChanged = previousUserId && currentUserId && String(previousUserId) !== String(currentUserId)

                if (userChanged) {
                    logger.info(`[Main] User changed from ${previousUserId} to ${currentUserId}, resetting connections`)

                    // Close old WebSocket connection to clean up presence for old user
                    ws.close()

                    // Disconnect from SFU and reset connection state
                    const {removeLocalStream} = await import('@/models/media')

                    // Close SFU connection if connected
                    if ($s.sfu.channel.connected) {
                        logger.info('[Main] Disconnecting from SFU due to user change')
                        const sfuModule = await import('@/models/sfu/sfu')
                        if (sfuModule.connection && sfuModule.connection.socket) {
                            sfuModule.connection.close()
                        }
                        // Reset SFU connection state
                        $s.sfu.channel.connected = false
                        $s.sfu.channel.name = ''
                    }

                    // Remove local media streams
                    removeLocalStream()

                    // Clear streams
                    $s.streams = []
                    $s.users = []

                    /*
                     * Reset device states - video/mic should be off after user switch
                     * User must explicitly enable them via button
                     */
                    $s.devices.cam.enabled = false
                    $s.devices.mic.enabled = false

                    // Small delay to ensure cleanup completes
                    await new Promise<void>((resolve) => {
                        setTimeout(() => {
                            resolve()
                        }, 200)
                    })

                    logger.info('[Main] Reset complete, video/mic disabled - user must enable via button')
                }

                ws.connect()

                // Set theme color
                const appElement = document.querySelector('.app')
                if (appElement) {
                    const themeColor = getComputedStyle(appElement).getPropertyValue('--grey-4')
                    const metaTheme = document.querySelector('meta[name="theme-color"]')
                    if (metaTheme) (metaTheme as HTMLMetaElement).content = themeColor
                }

                // Load emoji list
                if (!$s.chat.emoji.list.length) {
                    logger.info('retrieving initial emoji list')
                    $s.chat.emoji.list = JSON.parse(await api.get('/api/chat/emoji'))
                    store.save()
                }
                for (const emoji of $s.chat.emoji.list || []) {
                    const emojiStr = typeof emoji === 'string' ? emoji : String(emoji)
                    const codePoint = emojiStr.codePointAt(0)
                    if (codePoint !== undefined) {
                        emojiLookup.add(codePoint)
                    }
                }

                /*
                 * Load current user info to populate $s.profile
                 * IMPORTANT: Preserve existing credentials (username/password) that were set during login
                 * This ensures profile.id is always up-to-date, especially after debug_user switches
                 */
                try {
                    const userData = await api.get('/api/users/me')
                    if (userData?.id) {
                        // Store existing credentials before loading user data
                        const existingUsername = $s.profile.username || ''
                        const existingPassword = $s.profile.password || ''

                        // Always update profile.id to ensure it matches current session (critical for "You" detection)
                        $s.profile.id = userData.id
                        // Only set username if not already set (preserve login credentials)
                        if (!existingUsername && userData.username) {
                            $s.profile.username = userData.username
                        }
                        $s.profile.displayName = userData.profile?.displayName || userData.username || 'User'
                        $s.profile.avatar = userData.profile?.avatar || 'placeholder-1.png'

                        // Restore password if it was set (it won't come from API)
                        if (existingPassword) {
                            $s.profile.password = existingPassword
                        }

                        // Ensure chat.users entry exists for backward compatibility
                        if (!$s.chat.users) {
                            $s.chat.users = {}
                        }
                        ($s.chat.users as Record<string, {avatar: string; username: string}>)[userData.id] = {
                            avatar: $s.profile.avatar,
                            username: $s.profile.username,
                        }
                        logger.info(
                            `[Main] Loaded user: ${userData.id}, avatar: ${$s.profile.avatar}, ` +
                            `username preserved: ${!!existingUsername}, password preserved: ${!!existingPassword}`,
                        )
                    }
                } catch(error) {
                    logger.warn('[Main] Failed to load current user:', error)
                }
            }
        })()
    }, [])

    const handleLogin = async(username: string, password: string): Promise<string | null> => {
        try {
            const context = await api.post('/api/login', {
                password,
                username,
            })

            Object.assign($s.admin, context)

            // Store credentials for Galene group reuse
            $s.profile.username = username
            $s.profile.password = password

            // Also populate profile from context response (username, id, avatar, displayName, password)
            if (context.username) {
                $s.profile.username = context.username
            }
            if (context.password) {
                $s.profile.password = context.password
            }
            if (context.id) {
                $s.profile.id = context.id
            }
            if (context.profile) {
                $s.profile.avatar = context.profile.avatar || 'placeholder-1.png'
                $s.profile.displayName = context.profile.displayName || context.username || 'User'
            }

            /*
             * Check if user was authenticated - also check if we have user data (id, username) as fallback
             * This handles cases where authenticated might not be set but user data is present
             */
            const isAuthenticated = context.authenticated || (context.id && context.username)

            // Check permission - if permission is undefined, treat as false (no permission)
            const hasPermission = context.permission === true

            if (isAuthenticated && hasPermission) {
                notifier.notify({message: 'Login successful', type: 'info'})
                ws.connect()

                // Try to route to default channel
                try {
                    const defaultChannelResponse = await api.get('/api/channels/default')
                    if (defaultChannelResponse?.channel?.slug) {
                        // Set active channel in state and route to default channel
                        $s.chat.activeChannelSlug = defaultChannelResponse.channel.slug
                        // Route to default channel after a brief delay to ensure WebSocket is connected
                        setTimeout(() => {
                            route(`/channels/${defaultChannelResponse.channel.slug}`)
                        }, 100)
                    }
                } catch(error) {
                    // If getting default channel fails, just continue without redirecting
                    logger.debug('[Login] Could not get default channel:', error)
                }

                // Success
                return null
            }
            if (!isAuthenticated) {
                return 'Invalid credentials'
            }
            return 'No permission'
        } catch(error) {
            logger.error('[Login] Login error:', error)
            return 'Login failed. Please try again.'
        }
    }

    const handleLogout = async() => {
        const context = await api.get('/api/logout')
        mergeDeep($s.admin, context)
        // Clear stored credentials
        $s.profile.username = ''
        $s.profile.password = ''
        store.save()
        route('/')
    }

    const handleRoute = ({url}: {url: string}) => {
        // Update URL in global state for reactive access
        $s.env.url = url
    }

    if ($s.admin.authenticated === null) {
        return null
    }

    if (!$s.admin.authenticated) {
        return <Login
            animated={true}
            LogoIcon={IconLogo}
            onLogin={handleLogin}
            title='Pyrite'
        />
    }

    return (
        <div class={classnames('c-conference-app app', {'c-conference-mode': $s.panels.conferenceMode})}>
            <AppLayout
                context={$s.chat.activeChannelSlug ? <PanelContextSfu /> : null}
                menu={(
                    <PanelMenu
                        actions={(
                            <UserMenu
                                collapsed={$s.panels.menu.collapsed}
                                onLogout={handleLogout}
                                settingsHref='/settings'
                                user={{
                                    id: $s.profile.id || undefined,
                                    profile: {
                                        avatar: $s.profile.avatar || undefined,
                                        displayName: $s.profile.displayName || 'User',
                                    },
                                }}
                            />
                          )}
                        collapsed={$s.panels.menu.collapsed}
                        LinkComponent={Link}
                        logoCommitHash={process.env.APP_COMMIT_HASH || ''}
                        logoHref='/settings/groups'
                        LogoIcon={IconLogo}
                        logoText='PYRITE'
                        logoVersion={process.env.APP_VERSION || '2.0.0'}
                        navigation={<ChannelsContext />}
                        onCollapseChange={(collapsed) => {
                            $s.panels.menu.collapsed = collapsed
                            store.save()
                        }}
                    />
                  )}
            >
                <Router onChange={handleRoute}>
                    <Route component={Channel} path='/channels/:channelSlug/devices' />
                    <Route component={Channel} path='/channels/:channelSlug' />
                    <Route component={UsersFormWrapper} path='/settings/users/new' />
                    <Route component={UsersFormWrapper} path='/settings/users/:userId' />
                    <Route component={ChannelsFormWrapper} path='/settings/channels/new' />
                    <Route component={ChannelsFormWrapper} path='/settings/channels/:channelId' />
                    <Route component={Settings} path='/settings' />
                    <Route component={Settings} path='/settings/:tabId' />
                    <Route
                        component={() => <div class='c-welcome'>
                            <IconLogo />
                            <h1>Welcome to Pyrite</h1>
                            <p>Select a channel from the sidebar to start chatting.</p>
                        </div>}
                        default
                    />
                </Router>
                <Notifications notifications={$s.notifications} />
            </AppLayout>
        </div>
    )
}
