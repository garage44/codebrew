import {$s, i18n} from '@/app'
import {api, notifier, ws} from '@garage44/common/app'
import {$t} from '@garage44/expressio'
import {WorkspaceSettings, WorkspaceTranslations} from '@/components/pages'
import {Settings} from '@/components/settings/settings'
import {
    AppLayout,
    FieldSelect,
    MenuGroup,
    MenuItem,
    Notifications,
    PanelMenu,
    Progress,
    UserMenu,
} from '@garage44/common/components'
import {Link, Router, getCurrentUrl, route} from 'preact-router'
import {mergeDeep} from '@garage44/common/lib/utils'
import {Login} from '@/components/pages/login/login'
import {deepSignal} from 'deepsignal'
import {toIso6391} from '../../../lib/enola/iso-codes.ts'
import {useEffect} from 'preact/hooks'
import {effect} from '@preact/signals'

const state = deepSignal({
    workspace_id: null,
})

// Helper to determine if we're in single workspace mode
const isSingleWorkspace = () => $s.workspaces && $s.workspaces.length === 1

// Helper to get the appropriate translations URL based on workspace count
const getTranslationsUrl = () => {
    if (isSingleWorkspace()) {
        return '/translations'
    }
    if ($s.workspace) {
        return `/workspaces/${$s.workspace.config.workspace_id}/translations`
    }
    return '/translations'
}

// Helper to get the appropriate config URL based on workspace count
const getConfigUrl = () => {
    if (isSingleWorkspace()) {
        return '/config'
    }
    if ($s.workspace) {
        return `/workspaces/${$s.workspace.config.workspace_id}/settings`
    }
    return '/config'
}

/*
 * Component that redirects from root - ensures handleRoute is called
 * This component renders when path='/' matches
 * Uses effect to watch for workspace loading (handles both login and page refresh)
 */
const RootRedirect = () => {
    useEffect(() => {
        return effect(() => {
            // Watch for workspace to be loaded, then redirect
            if ($s.workspace && $s.workspaces && $s.workspaces.length > 0 && getCurrentUrl() === '/') {
                if (isSingleWorkspace()) {
                    route('/translations', true)
                } else {
                    route(`/workspaces/${$s.workspaces[0].workspace_id}/translations`, true)
                }
            }
        })
    }, [])
    return null
}

export const Main = () => {
    useEffect(() => {
        (async() => {
            const context = await api.get('/api/context')

            /*
             * Context now includes full user profile (id, username, profile.avatar, profile.displayName)
             * Set user authentication/admin flags
             */
            $s.profile.admin = context.admin || false
            $s.profile.authenticated = context.authenticated || false
            // Set profile data from context
            if (context.id) $s.profile.id = context.id
            if (context.username) $s.profile.username = context.username
            if (context.password) $s.profile.password = context.password
            if (context.profile) {
                $s.profile.avatar = context.profile.avatar || 'placeholder-1.png'
                $s.profile.displayName = context.profile.displayName || context.username || 'User'
            }

            if (context.authenticated) {
                ws.connect()
                const config = await api.get('/api/config')

                $s.profile.authenticated = true
                mergeDeep($s, {
                    enola: config.enola,
                    workspaces: config.workspaces,
                })

                // Auto-select first workspace if available and no workspace is selected
                if (config.workspaces && config.workspaces.length > 0 && !state.workspace_id) {
                    const firstWorkspace = config.workspaces[0]
                    state.workspace_id = firstWorkspace.workspace_id
                    const workspaceResult = await ws.get(
                        `/api/workspaces/${firstWorkspace.workspace_id}`,
                    ) as {config: unknown; i18n: unknown; id: string}
                    $s.workspace = {
                        config: workspaceResult.config,
                        i18n: workspaceResult.i18n,
                    } as typeof $s.workspace
                    // RootRedirect component will handle redirect from '/' if needed
                }
            } else {
                route('/login')
            }
        })()
    }, [])

    if ($s.profile.authenticated === null) {
        return null
    }

    if ($s.profile.authenticated === false) {
        return <Login />
    }
    const handleRoute = async({url}: {url: string}) => {
        // Update URL in global state for reactive access
        $s.env.url = url

        /*
         * Handle root path - ensure workspace is loaded
         * The RootRedirect component will handle the actual redirect
         */
        if (url === '/') {
            // Ensure workspace is loaded for root redirect
            if (!$s.workspace && $s.workspaces && $s.workspaces.length > 0) {
                const firstWorkspace = $s.workspaces[0]
                state.workspace_id = firstWorkspace.workspace_id
                const workspaceResult = await ws.get(
                    `/api/workspaces/${firstWorkspace.workspace_id}`,
                ) as {config: unknown; i18n: unknown; id: string}
                $s.workspace = {
                    config: workspaceResult.config,
                    i18n: workspaceResult.i18n,
                } as typeof $s.workspace
            }
            return
        }

        /*
         * Handle simplified routes (/translations, /config):
         * These automatically use the first/single workspace
         */
        if (url === '/translations' || url === '/config') {
            // Ensure a workspace is loaded for these routes
            if (!$s.workspace && $s.workspaces && $s.workspaces.length > 0) {
                const firstWorkspace = $s.workspaces[0]
                state.workspace_id = firstWorkspace.workspace_id
                const workspaceResult = await ws.get(
                    `/api/workspaces/${firstWorkspace.workspace_id}`,
                ) as {config: unknown; i18n: unknown; id: string}
                $s.workspace = {
                    config: workspaceResult.config,
                    i18n: workspaceResult.i18n,
                } as typeof $s.workspace
            }
            return
        }

        // Handle full workspace routes (multi-workspace mode)
        const match = url.match(/\/workspaces\/([^/]+)/)
        if (match && (!$s.workspace || match[1] !== $s.workspace.config.workspace_id)) {
            const result = await ws.get(`/api/workspaces/${match[1]}`) as {
                config: unknown
                error?: string
                i18n: unknown
                id: string
            }

            if (result.error) {
                notifier.notify({message: $t(i18n.workspace.error.not_found), type: 'error'})
                // On error, redirect to appropriate translations
                if (isSingleWorkspace()) {
                    route('/translations', true)
                } else if ($s.workspaces && $s.workspaces.length > 0) {
                    const firstWorkspace = $s.workspaces[0]
                    route(`/workspaces/${firstWorkspace.workspace_id}/translations`, true)
                }
            } else {
                state.workspace_id = match[1]
                $s.workspace = {
                    config: result.config,
                    i18n: result.i18n,
                } as typeof $s.workspace
            }
        }
    }

    return <>
        <AppLayout
            menu={(
                <PanelMenu
                    actions={(
                        <UserMenu
                            collapsed={$s.panels.menu.collapsed}
                            onLogout={async() => {
                                const result = await api.get('/api/logout')
                                $s.profile.authenticated = result.authenticated || false
                                $s.profile.admin = result.admin || false
                                route('/')
                            }}
                            settingsHref='/settings'
                            user={{
                                id: $s.profile.id || null,
                                profile: {
                                    avatar: $s.profile.avatar || null,
                                    displayName: $s.profile.displayName || $s.profile.username || 'User',
                                },
                            }}
                        />
                      )}
                    collapsed={$s.panels.menu.collapsed}
                    footer={
                        !!Object.values($s.enola.engines).length &&
                        <div class='engines'>
                            {Object.values($s.enola.engines).filter((engine) => {
                                const engineConfig = engine as {
                                    active?: boolean
                                    name?: string
                                    usage?: {count: number; limit: number; loading?: boolean}
                                }
                                return engineConfig.active === true
                            }).map((engine) => {
                                const engineConfig = engine as {
                                    name: string
                                    usage: {count: number; limit: number; loading?: boolean}
                                }
                                return (
                                    <div class='usage' key={engineConfig.name}>
                                        <span>{$t(i18n.menu.usage, {engine: engineConfig.name})}</span>
                                        <Progress
                                            boundaries={[engineConfig.usage.count, engineConfig.usage.limit]}
                                            iso6391={toIso6391($s.language_ui.selection)}
                                            loading={engineConfig.usage.loading || false}
                                            percentage={engineConfig.usage.count / engineConfig.usage.limit}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    }
                    LinkComponent={Link}
                    logoCommitHash={process.env.APP_COMMIT_HASH || ''}
                    logoHref='/'
                    logoSrc='/public/img/logo.svg'
                    logoText='Expressio'
                    logoVersion={process.env.APP_VERSION || ''}
                    navigation={(
                        <MenuGroup collapsed={$s.panels.menu.collapsed}>
                            {/* Only show workspace dropdown when multiple workspaces exist */}
                            {$s.workspaces && $s.workspaces.length > 1 &&
                                <FieldSelect
                                    disabled={!$s.workspaces.length}
                                    help={$t(i18n.menu.workspaces.help)}
                                    label={$t(i18n.menu.workspaces.label)}
                                    model={state.$workspace_id}
                                    onChange={async(workspace_id) => {
                                        const workspaceResult = await ws.get(
                                            `/api/workspaces/${workspace_id}`,
                                        ) as {config: unknown; i18n: unknown; id: string}
                                        $s.workspace = {
                                            config: workspaceResult.config,
                                            i18n: workspaceResult.i18n,
                                        } as typeof $s.workspace
                                        // Check if current route is valid for the new workspace
                                        const currentPath = getCurrentUrl()
                                        const isOnSettings = currentPath.endsWith('/settings') || currentPath === '/config'
                                        const isOnTranslations = currentPath.endsWith('/translations')

                                        // Navigate to the appropriate route for the new workspace
                                        if (isOnSettings) {
                                            route(`/workspaces/${workspace_id}/settings`)
                                        } else if (isOnTranslations) {
                                            route(`/workspaces/${workspace_id}/translations`)
                                        } else {
                                            route(`/workspaces/${workspace_id}/translations`)
                                        }
                                    }}
                                    options={$s.workspaces.map((i) => ({id: i.workspace_id, name: i.workspace_id}))}
                                    placeholder={$t(i18n.menu.workspaces.placeholder)}
                                />}

                            {/* Translations menu item - first */}
                            <MenuItem
                                active={$s.env.url.endsWith('/translations')}
                                collapsed={$s.panels.menu.collapsed}
                                disabled={!$s.workspace}
                                href={getTranslationsUrl()}
                                icon='translate'
                                iconType='info'
                                text={$t(i18n.menu.workspace.translations)}
                            />
                            {/* Workspace config menu item - second */}
                            <MenuItem
                                active={$s.env.url.endsWith('/settings') || $s.env.url === '/config'}
                                collapsed={$s.panels.menu.collapsed}
                                disabled={!$s.workspace}
                                href={getConfigUrl()}
                                icon='workspace'
                                iconType='info'
                                text={$t(i18n.menu.workspace.config)}
                            />
                        </MenuGroup>
                      )}
                    onCollapseChange={(collapsed) => {
                        $s.panels.menu.collapsed = collapsed
                    }}
                />
              )}
        >
            <div class='view'>
                <Router onChange={handleRoute}>
                    {/* Root redirect - must be first to catch / */}
                    <RootRedirect />

                    {/* User settings - always at /settings */}
                    <Settings />

                    {/* Simplified routes for single workspace mode */}
                    <WorkspaceTranslations />
                    <WorkspaceSettings />

                    {/* Full workspace routes for multi-workspace mode */}
                    <WorkspaceSettings />
                    <WorkspaceTranslations />
                </Router>
            </div>
        </AppLayout>
        <Notifications notifications={$s.notifications} />
    </>
}
