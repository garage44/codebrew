import {api, logger, notifier, ws} from '@garage44/common/app'
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
import {mergeDeep} from '@garage44/common/lib/utils'
import {$t} from '@garage44/expressio'
import {effect} from '@preact/signals'
import {deepSignal} from 'deepsignal'
import {Link, Route, Router, getCurrentUrl, route} from 'preact-router'
import {useEffect} from 'preact/hooks'

import {$s, i18n} from '@/app'
import {WorkspaceSettings, WorkspaceTranslations} from '@/components/pages'
import {Login} from '@/components/pages/login/login'
import {Settings} from '@/components/settings/settings'

import {toIso6391} from '../../../lib/enola/iso-codes.ts'

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
    const workspaceId = $s.workspace?.config?.workspace_id
    // Ensure workspaceId is a valid string before using it in URL
    if (workspaceId && typeof workspaceId === 'string' && workspaceId !== 'undefined' && workspaceId !== 'null') {
        return `/workspaces/${workspaceId}/translations`
    }
    return '/translations'
}

// Helper to get the appropriate config URL based on workspace count
const getConfigUrl = () => {
    if (isSingleWorkspace()) {
        return '/config'
    }
    const workspaceId = $s.workspace?.config?.workspace_id
    // Ensure workspaceId is a valid string before using it in URL
    if (workspaceId && typeof workspaceId === 'string' && workspaceId !== 'undefined' && workspaceId !== 'null') {
        return `/workspaces/${workspaceId}/settings`
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
            try {
                const currentUrl = getCurrentUrl()
                if (!currentUrl || typeof currentUrl !== 'string') {
                    return
                }
                if ($s.workspace && $s.workspaces && $s.workspaces.length > 0 && currentUrl === '/') {
                    try {
                        if (isSingleWorkspace()) {
                            route('/translations', true)
                        } else {
                            const firstWorkspace = $s.workspaces[0]
                            if (
                                firstWorkspace &&
                                firstWorkspace.workspace_id &&
                                typeof firstWorkspace.workspace_id === 'string'
                            ) {
                                const targetUrl = `/workspaces/${firstWorkspace.workspace_id}/translations`
                                route(targetUrl, true)
                            }
                        }
                    } catch (error) {
                        logger.debug('[RootRedirect] Routing error:', error)
                    }
                }
            } catch (error) {
                // Silently handle routing errors during initialization
                logger.debug('[RootRedirect] Routing error:', error)
            }
        })
    }, [])
    return null
}

export const Main = () => {
    useEffect(() => {
        ;(async () => {
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
                    const workspaceResult = (await ws.get(`/api/workspaces/${firstWorkspace.workspace_id}`)) as {
                        config: unknown
                        i18n: unknown
                        id: string
                    }
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

    /*
     * Only mount Router when workspace state is ready
     * This prevents preact-router from processing routes before workspace state is initialized
     * At this point, authenticated must be true (we've already handled null and false cases above)
     * Wait for workspaces config to be loaded from API (not just initialized as empty array)
     * We know workspaces are loaded when the array exists and either:
     * 1. It has items (workspaces exist), OR
     * 2. A workspace has been selected and loaded ($s.workspace is set)
     */
    /*
     * CRITICAL: Router must only mount after the initial API call to /api/config has completed.
     * We detect this by checking if enola config exists (set alongside workspaces in mergeDeep).
     * This prevents Router from mounting when $s.workspaces is just the initial empty array [].
     * When user manually sets authenticated=true, Router would mount too early without this check.
     */
    const workspacesConfigLoaded = $s.workspaces !== undefined && $s.workspaces !== null && Array.isArray($s.workspaces)

    /*
     * Only mount Router if enola config exists (indicates /api/config has been called)
     * This ensures Router doesn't mount before the initial API call completes
     */
    const configLoaded = $s.enola !== undefined && $s.enola !== null
    const shouldMountRouter = workspacesConfigLoaded && configLoaded

    const handleRoute = async ({url}: {url: string}) => {
        // Guard against undefined or invalid url
        if (!url || typeof url !== 'string') {
            return
        }

        /*
         * Early return if workspaces aren't loaded yet (prevents processing routes during initialization)
         * This prevents preact-router from trying to process routes before workspace state is ready
         */
        if ((!$s.workspaces || $s.workspaces.length === 0) && url !== '/login') {
            // If we're not on login page, wait for workspaces to load
            return
        }

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
                const workspaceResult = (await ws.get(`/api/workspaces/${firstWorkspace.workspace_id}`)) as {
                    config: unknown
                    i18n: unknown
                    id: string
                }
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
                const workspaceResult = (await ws.get(`/api/workspaces/${firstWorkspace.workspace_id}`)) as {
                    config: unknown
                    i18n: unknown
                    id: string
                }
                $s.workspace = {
                    config: workspaceResult.config,
                    i18n: workspaceResult.i18n,
                } as typeof $s.workspace
            }
            return
        }

        // Handle full workspace routes (multi-workspace mode)
        const match = url.match(/\/workspaces\/([^/]+)/)
        if (match && match[1]) {
            const workspaceIdFromUrl = match[1]

            /*
             * Validate workspaceIdFromUrl is not 'undefined' string (can happen if URL is malformed)
             */
            if (workspaceIdFromUrl === 'undefined' || workspaceIdFromUrl === 'null') {
                logger.debug('[Main] Invalid workspace ID in URL:', workspaceIdFromUrl)
                return
            }
            const currentWorkspaceId = $s.workspace?.config?.workspace_id
            if (!$s.workspace || currentWorkspaceId !== workspaceIdFromUrl) {
                const result = (await ws.get(`/api/workspaces/${workspaceIdFromUrl}`)) as {
                    config: unknown
                    error?: string
                    i18n: unknown
                    id: string
                }

                if (result.error) {
                    notifier.notify({message: $t(i18n.workspace.error.not_found), type: 'error'})
                    // On error, redirect to appropriate translations
                    try {
                        if (isSingleWorkspace()) {
                            route('/translations', true)
                        } else if ($s.workspaces && $s.workspaces.length > 0) {
                            const firstWorkspace = $s.workspaces[0]
                            if (firstWorkspace && firstWorkspace.workspace_id) {
                                route(`/workspaces/${firstWorkspace.workspace_id}/translations`, true)
                            }
                        }
                    } catch (error) {
                        logger.debug('[Main] Routing error on workspace not found:', error)
                    }
                } else {
                    state.workspace_id = workspaceIdFromUrl
                    $s.workspace = {
                        config: result.config,
                        i18n: result.i18n,
                    } as typeof $s.workspace
                }
            }
        }
    }

    return (
        <>
            <AppLayout
                menu={
                    <PanelMenu
                        actions={
                            <UserMenu
                                collapsed={$s.panels.menu.collapsed}
                                onLogout={async () => {
                                    const result = await api.get('/api/logout')
                                    $s.profile.authenticated = result.authenticated || false
                                    $s.profile.admin = result.admin || false
                                    try {
                                        route('/')
                                    } catch (error) {
                                        // Silently handle routing errors
                                        logger.debug('[Main] Routing error on logout:', error)
                                    }
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
                        }
                        collapsed={$s.panels.menu.collapsed}
                        footer={
                            !!Object.values($s.enola.engines).length && (
                                <div class='engines'>
                                    {Object.values($s.enola.engines)
                                        .filter((engine) => {
                                            const engineConfig = engine as {
                                                active?: boolean
                                                name?: string
                                                usage?: {count: number; limit: number; loading?: boolean}
                                            }
                                            return engineConfig.active === true
                                        })
                                        .map((engine) => {
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
                            )
                        }
                        LinkComponent={Link}
                        logoCommitHash={process.env.APP_COMMIT_HASH || ''}
                        logoHref='/'
                        logoSrc='/public/img/logo.svg'
                        logoText='Expressio'
                        logoVersion={process.env.APP_VERSION || ''}
                        navigation={
                            <MenuGroup collapsed={$s.panels.menu.collapsed}>
                                {/* Only show workspace dropdown when multiple workspaces exist */}
                                {$s.workspaces && $s.workspaces.length > 1 && (
                                    <FieldSelect
                                        disabled={!$s.workspaces.length}
                                        help={$t(i18n.menu.workspaces.help)}
                                        label={$t(i18n.menu.workspaces.label)}
                                        model={state.$workspace_id}
                                        onChange={async (workspace_id) => {
                                            if (!workspace_id) {
                                                return
                                            }
                                            const workspaceResult = (await ws.get(`/api/workspaces/${workspace_id}`)) as {
                                                config: unknown
                                                i18n: unknown
                                                id: string
                                            }
                                            $s.workspace = {
                                                config: workspaceResult.config,
                                                i18n: workspaceResult.i18n,
                                            } as typeof $s.workspace
                                            // Check if current route is valid for the new workspace
                                            const currentPath = getCurrentUrl()
                                            if (!currentPath || typeof currentPath !== 'string') {
                                                return
                                            }
                                            const isOnSettings = currentPath.endsWith('/settings') || currentPath === '/config'
                                            const isOnTranslations = currentPath.endsWith('/translations')

                                            // Navigate to the appropriate route for the new workspace
                                            try {
                                                if (isOnSettings) {
                                                    route(`/workspaces/${workspace_id}/settings`)
                                                } else if (isOnTranslations) {
                                                    route(`/workspaces/${workspace_id}/translations`)
                                                } else {
                                                    route(`/workspaces/${workspace_id}/translations`)
                                                }
                                            } catch (error) {
                                                logger.debug('[Main] Routing error on workspace change:', error)
                                            }
                                        }}
                                        options={$s.workspaces.map((i) => ({id: i.workspace_id, name: i.workspace_id}))}
                                        placeholder={$t(i18n.menu.workspaces.placeholder)}
                                    />
                                )}

                                {/* Translations menu item - first */}
                                <MenuItem
                                    active={($s.env.url || '').endsWith('/translations')}
                                    collapsed={$s.panels.menu.collapsed}
                                    disabled={!$s.workspace}
                                    href={getTranslationsUrl()}
                                    icon='translate'
                                    iconType='info'
                                    text={$t(i18n.menu.workspace.translations)}
                                />
                                {/* Workspace config menu item - second */}
                                <MenuItem
                                    active={($s.env.url || '').endsWith('/settings') || $s.env.url === '/config'}
                                    collapsed={$s.panels.menu.collapsed}
                                    disabled={!$s.workspace}
                                    href={getConfigUrl()}
                                    icon='workspace'
                                    iconType='info'
                                    text={$t(i18n.menu.workspace.config)}
                                />
                            </MenuGroup>
                        }
                        onCollapseChange={(collapsed) => {
                            $s.panels.menu.collapsed = collapsed
                        }}
                    />
                }
            >
                <div class='view'>
                    {shouldMountRouter ? (
                        <Router onChange={handleRoute}>
                            {/* Root redirect - must be first to catch / */}
                            <Route component={RootRedirect} path='/' />

                            {/* User settings - always at /settings */}
                            <Route component={Settings} path='/settings' />

                            {/* Simplified routes for single workspace mode */}
                            <Route component={WorkspaceTranslations} path='/translations' />
                            <Route component={WorkspaceSettings} path='/config' />

                            {/* Full workspace routes for multi-workspace mode */}
                            <Route component={WorkspaceSettings} path='/workspaces/:workspaceId/settings' />
                            <Route component={WorkspaceTranslations} path='/workspaces/:workspaceId/translations' />
                        </Router>
                    ) : null}
                </div>
            </AppLayout>
            <Notifications notifications={$s.notifications} />
        </>
    )
}
