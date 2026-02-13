import {api, events, store, ws} from '@garage44/common/app'
import {AppLayout, Icon, MenuGroup, MenuItem, Notifications, PanelMenu, UserMenu} from '@garage44/common/components'
import {Login} from '@garage44/common/components'
import {getApps} from '@garage44/common/lib/codebrew-registry'
import {Link, Route, Router} from 'preact-router'
import {useEffect} from 'preact/hooks'

import type {CodebrewState} from '@/types'

import {$s} from '@/app'

interface ApiContext {
    admin?: boolean | string
    authenticated?: boolean
    id?: string
    profile?: {avatar?: string; displayName?: string}
    username?: string
}

interface LoginResult {
    admin?: boolean | string
    authenticated?: boolean
    error?: string
    id?: string
    profile?: {avatar?: string; displayName?: string}
    username?: string
}

export const Main = () => {
    useEffect(() => {
        events.on('app:init', () => {
            ws.on('/users/presence', (data: {userid?: string; status?: string}) => {
                if (!$s.chat) return
                if (!($s.chat as {users?: Record<string, unknown>}).users) {
                    ;($s.chat as {users: Record<string, unknown>}).users = {}
                }
                const users = ($s.chat as {users: Record<string, unknown>}).users
                if (data.status === 'offline' && data.userid) {
                    delete users[data.userid]
                }
            })
        })
    }, [])

    useEffect(() => {
        ;(async () => {
            const context = (await api.get('/api/context')) as ApiContext
            const isAuthenticated = context.authenticated || (context.id && context.username)
            $s.profile.admin = Boolean(context.admin === true || context.admin === 'true')
            $s.profile.authenticated = Boolean(isAuthenticated)
            if (context.id) {
                $s.profile.id = context.id
            }
            if (context.username) {
                $s.profile.username = context.username
            }
            if (context.profile) {
                $s.profile.avatar = context.profile.avatar || 'placeholder-1.png'
                $s.profile.displayName = context.profile.displayName || context.username || 'User'
            }

            if (isAuthenticated) {
                ws.connect()
                ws.get('/api/presence/users')
                    .then((res) => {
                        if (res && typeof res === 'object' && 'users' in res) {
                            const users = (res as {users?: Record<string, {avatar?: string; username?: string}>}).users
                            if (users && $s.chat) {
                                $s.chat.users = users
                            }
                        }
                    })
                    .catch(() => {
                        /* Presence may not be available */
                    })
            }
        })()
    }, [])

    const apps = getApps()

    if (!$s.profile.authenticated) {
        return (
            <Login
                LogoIcon={() => <Icon name='extension' />}
                onLogin={async (username: string, password: string) => {
                    const result = (await api.post('/api/login', {
                        password,
                        username,
                    })) as LoginResult
                    const isAuthenticated = result.authenticated || (result.id && result.username)
                    if (isAuthenticated) {
                        $s.profile.authenticated = true
                        $s.profile.admin = result.admin === true || result.admin === 'true'
                        if (result.id) {
                            $s.profile.id = result.id
                        }
                        if (result.username) {
                            $s.profile.username = result.username
                        }
                        if (result.profile) {
                            $s.profile.avatar = result.profile.avatar || 'placeholder-1.png'
                            $s.profile.displayName = result.profile.displayName || result.username || 'User'
                        }
                        ws.connect()
                        return null
                    }
                    return result.error || 'Invalid credentials'
                }}
                title='Codebrew'
            />
        )
    }

    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/'
    const activeApp = apps.find((a) => currentPath.startsWith(`/${a.id}`))?.id || apps[0]?.id
    const activeAppPlugin = apps.find((a) => a.id === activeApp)

    return (
        <>
            <AppLayout
                menu={
                    <PanelMenu
                        actions={
                            <>
                                {apps
                                    .filter((app) => app.presenceWidget)
                                    .map((app) => {
                                        const Widget = app.presenceWidget!
                                        return <Widget key={app.id} />
                                    })}
                                <UserMenu
                                collapsed={$s.panels.menu.collapsed}
                                onLogout={async () => {
                                    await api.get('/api/logout')
                                    $s.profile.authenticated = false
                                }}
                                settingsHref='/settings'
                                user={{
                                    id: $s.profile.id ?? undefined,
                                    profile: {
                                        avatar: $s.profile.avatar ?? undefined,
                                        displayName: $s.profile.displayName || $s.profile.username || 'User',
                                    },
                                }}
                            />
                            </>
                        }
                        collapsed={$s.panels.menu.collapsed}
                        LinkComponent={Link}
                        logoCommitHash={process.env.APP_COMMIT_HASH || ''}
                        logoHref='/'
                        logoText='Codebrew'
                        logoVersion={process.env.APP_VERSION || ''}
                        navigation={
                            <>
                                <MenuGroup collapsed={$s.panels.menu.collapsed}>
                                    {apps.map((app) => (
                                        <MenuItem
                                            active={activeApp === app.id}
                                            collapsed={$s.panels.menu.collapsed}
                                            href={app.defaultRoute}
                                            icon={app.icon}
                                            iconType='info'
                                            key={app.id}
                                            text={app.name}
                                        />
                                    ))}
                                </MenuGroup>
                                {activeAppPlugin?.menuItems && (
                                    <MenuGroup collapsed={$s.panels.menu.collapsed}>
                                        {activeAppPlugin.menuItems.map((item) => (
                                            <MenuItem
                                                active={currentPath === item.href}
                                                collapsed={$s.panels.menu.collapsed}
                                                href={item.href}
                                                icon={item.icon}
                                                iconType='info'
                                                key={item.href}
                                                text={item.text}
                                            />
                                        ))}
                                    </MenuGroup>
                                )}
                            </>
                        }
                        onCollapseChange={(collapsed) => {
                            ;($s.panels.menu as {collapsed: boolean}).collapsed = collapsed
                            store.save()
                        }}
                    />
                }
            >
                <div class='view'>
                    <Router>
                        {apps.flatMap((app) =>
                            app.routes.map((r) => (
                                <Route component={r.component} default={r.default} key={`${app.id}-${r.path}`} path={r.path} />
                            )),
                        )}
                        <Route
                            component={() => (
                                <div class='c-codebrew-welcome'>
                                    <h1>Codebrew</h1>
                                    <p>Select an app from the sidebar</p>
                                </div>
                            )}
                            default
                        />
                    </Router>
                </div>
            </AppLayout>
            <Notifications notifications={$s.notifications as CodebrewState['notifications']} />
        </>
    )
}
