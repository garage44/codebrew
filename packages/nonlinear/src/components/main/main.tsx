import type {Notification} from '@garage44/common/lib/notifier'

import {api, logger, store, ws} from '@garage44/common/app'
import {
    AppLayout,
    MenuGroup,
    MenuItem,
    Notifications,
    PanelContext,
    PanelMenu,
    Progress,
    UserMenu,
} from '@garage44/common/components'
import {copyObject, mergeDeep} from '@garage44/common/lib/utils'
import {Link, Route, Router, route} from 'preact-router'
import {useEffect} from 'preact/hooks'

import type {FrontendAgent} from '@/types'

import {$s} from '@/app'
import {TicketForm} from '@/components/elements/ticket-form/ticket-form'
import {Board, Docs, Settings, TicketDetail} from '@/components/pages'
import {Login} from '@/components/pages/login/login'

export const Main = () => {
    useEffect(() => {
        ;(async () => {
            const context = (await api.get('/api/context')) as {
                admin?: boolean
                authenticated?: boolean
                id?: string
                profile?: {avatar?: string; displayName?: string}
                username?: string
            }

            /*
             * Check if user was authenticated - the response should have authenticated: true
             * Also check if we have user data (id, username) as an alternative indicator
             * This handles cases where authenticated might not be set but user data is present
             */
            const isAuthenticated = Boolean(context.authenticated || (context.id && context.username))

            $s.profile.admin = Boolean(context.admin)
            $s.profile.authenticated = isAuthenticated
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

                // Load initial data
                const ticketsResult = (await ws.get('/api/tickets')) as {tickets?: unknown}
                if (ticketsResult.tickets) {
                    $s.tickets = ticketsResult.tickets as typeof $s.tickets
                }

                const reposResult = (await ws.get('/api/repositories')) as {repositories?: unknown}
                if (reposResult.repositories) {
                    $s.repositories = reposResult.repositories as typeof $s.repositories
                }

                // Load Anthropic token usage
                const usageResult = (await ws.get('/api/anthropic/usage')) as {usage?: {count?: number; limit?: number}}
                if (usageResult.usage) {
                    $s.anthropic.usage = {
                        count: usageResult.usage.count || 0,
                        limit: usageResult.usage.limit || 1_000_000,
                        loading: false,
                    }
                }

                /*
                 * Load bootstrap state from HTML if available (SSR hydration pattern)
                 * This should be loaded BEFORE the API call so we can merge it
                 */
                const bootstrapState =
                    typeof window !== 'undefined'
                        ? (
                              window as {
                                  __NONLINEAR_BOOTSTRAP_STATE__?: {
                                      agents: Record<
                                          string,
                                          {
                                              stats?: {completed: number; failed: number; pending: number; processing: number}
                                              status: 'idle' | 'working' | 'error' | 'offline'
                                          }
                                      >
                                  }
                              }
                          ).__NONLINEAR_BOOTSTRAP_STATE__
                        : null

                if (bootstrapState?.agents) {
                    const agentIds = Object.keys(bootstrapState.agents)
                    logger.info(`[Bootstrap] Applying bootstrap state for ${agentIds.length} agents: ${agentIds.join(', ')}`)
                    for (const [agentId, state] of Object.entries(bootstrapState.agents)) {
                        logger.debug(
                            `[Bootstrap] Agent ${agentId}: status=${state.status}, ` +
                                `stats=${JSON.stringify(state.stats)}, statsExists=${Boolean(state.stats)}`,
                        )
                    }
                }

                const agentsResult = (await ws.get('/api/agents')) as {
                    agents?: Array<{
                        avatar: string | null
                        created_at: number
                        currentTicketId: string | null
                        display_name: string | null
                        enabled: number
                        id: string
                        lastActivity: number
                        name: string
                        serviceOnline?: boolean
                        stats?: {completed: number; failed: number; pending: number; processing: number}
                        status: string
                        type: 'developer' | 'planner' | 'reviewer'
                    }>
                }
                if (agentsResult.agents) {
                    $s.agents = agentsResult.agents.map(
                        (agent: {
                            avatar: string | null
                            created_at: number
                            currentTicketId: string | null
                            display_name: string | null
                            enabled: number
                            id: string
                            lastActivity: number
                            name: string
                            serviceOnline?: boolean
                            stats?: {
                                completed: number
                                failed: number
                                pending: number
                                processing: number
                            }
                            status: string
                            type: 'planner' | 'developer' | 'reviewer'
                        }) => {
                            // Start with base agent data from API
                            const baseAgent = {
                                avatar: agent.avatar || 'placeholder-2.png',
                                config: '',
                                created_at: agent.created_at,
                                currentTicketId: agent.currentTicketId || null,
                                displayName: agent.display_name || `${agent.name} Agent`,
                                enabled: agent.enabled,
                                id: agent.id,
                                isAgent: true as const,
                                lastActivity: agent.lastActivity || agent.created_at,
                                name: agent.name,
                                serviceOnline: agent.serviceOnline ?? false,
                                stats: agent.stats || {
                                    completed: 0,
                                    failed: 0,
                                    pending: 0,
                                    processing: 0,
                                },
                                status: (agent.status || 'idle') as 'idle' | 'working' | 'error' | 'offline',
                                type: agent.type,
                                username: agent.name,
                            }

                            // Merge bootstrap state over base agent (bootstrap takes precedence)
                            const bootstrapAgent = bootstrapState?.agents?.[agent.id]
                            if (bootstrapAgent) {
                                // Create a copy of baseAgent before merging (mergeDeep mutates the target)
                                const agentCopy = copyObject(baseAgent)

                                /*
                                 * Use mergeDeep to merge bootstrap state over base agent
                                 * Bootstrap state has status and stats, which will override base values
                                 */
                                mergeDeep(agentCopy, {
                                    stats: bootstrapAgent.stats,
                                    status: bootstrapAgent.status,
                                })

                                // ServiceOnline is derived from status
                                agentCopy.serviceOnline = agentCopy.status !== 'offline'

                                if (process.env.NODE_ENV === 'development') {
                                    logger.debug(
                                        `[Bootstrap] Merged agent ${agent.id} using mergeDeep: ` +
                                            `status=${agentCopy.status}, stats=${JSON.stringify(agentCopy.stats)}`,
                                    )
                                }

                                return agentCopy
                            }

                            // No bootstrap state - derive serviceOnline from status
                            baseAgent.serviceOnline = baseAgent.status !== 'offline'
                            return baseAgent
                        },
                    )
                }

                // Load label definitions
                const labelsResult = (await ws.get('/api/labels')) as {labels?: unknown}
                if (labelsResult.labels) {
                    $s.labelDefinitions = labelsResult.labels as typeof $s.labelDefinitions
                }

                // Subscribe to real-time updates
                ws.on('/tickets', (data) => {
                    if (data.type === 'ticket:created' || data.type === 'ticket:updated') {
                        // Update ticket in state - create new array for DeepSignal reactivity
                        const index = $s.tickets.findIndex((t) => t.id === data.ticket.id)
                        if (index !== -1) {
                            const updatedTickets = [...$s.tickets]
                            updatedTickets[index] = data.ticket
                            $s.tickets = updatedTickets
                        } else {
                            $s.tickets = [...$s.tickets, data.ticket]
                        }
                    } else if (data.type === 'ticket:deleted') {
                        $s.tickets = $s.tickets.filter((t) => t.id !== data.ticketId)
                    }
                })

                ws.on('/repositories', (data) => {
                    if (data.type === 'repository:created' || data.type === 'repository:updated') {
                        const index = $s.repositories.findIndex((r) => r.id === data.repository.id)
                        if (index !== -1) {
                            $s.repositories[index] = data.repository
                        } else {
                            $s.repositories = [...$s.repositories, data.repository]
                        }
                    } else if (data.type === 'repository:deleted') {
                        $s.repositories = $s.repositories.filter((r) => r.id !== data.repositoryId)
                    }
                })

                // Listen for agent state updates (watched state pattern)
                ws.on('/agents/state', ({agents: agentStates, timestamp}) => {
                    if (process.env.NODE_ENV === 'development') {
                        // eslint-disable-next-line no-console
                        console.log('[Frontend] Received /agents/state broadcast:', {agentStates, timestamp})
                    }

                    /*
                     * Update status and stats for all agents from watched state
                     * Create a new array to ensure DeepSignal detects the change
                     */
                    const updatedAgents = $s.agents.map((agent) => {
                        const state = agentStates[agent.id]
                        if (state) {
                            // Use mergeDeep to merge state updates (status and stats)
                            const agentCopy = copyObject(agent)
                            mergeDeep(agentCopy, {
                                stats: state.stats,
                                status: state.status,
                            })

                            // ServiceOnline is derived from status
                            agentCopy.serviceOnline = agentCopy.status !== 'offline'

                            return agentCopy
                        }
                        return agent
                    })

                    /*
                     * Assign new array to trigger reactivity
                     * DeepSignal tracks array assignment and will trigger component re-renders
                     */
                    $s.agents = updatedAgents

                    if (process.env.NODE_ENV === 'development') {
                        logger.info(`[Frontend] Updated ${updatedAgents.length} agents from /agents/state broadcast`)
                        for (const agent of updatedAgents) {
                            logger.debug(
                                `[Frontend] Agent ${agent.id}: status=${agent.status}, stats=${JSON.stringify(agent.stats)}`,
                            )
                        }
                    }
                })

                ws.on('/agents', (data) => {
                    if (data.type === 'agent:created' || data.type === 'agent:updated') {
                        const {agent} = data
                        const index = $s.agents.findIndex((a) => a.id === agent.id)
                        const transformedAgent: FrontendAgent = {
                            avatar: agent.avatar || 'placeholder-2.png',
                            config: agent.config || '',
                            created_at: agent.created_at,
                            currentTicketId: null,
                            displayName: agent.display_name || `${agent.name} Agent`,
                            enabled: agent.enabled,
                            id: agent.id,
                            isAgent: true as const,
                            lastActivity: Date.now(),
                            name: agent.name,
                            serviceOnline: false,
                            stats: agent.stats || {completed: 0, failed: 0, pending: 0, processing: 0},
                            status: (agent.status || 'idle') as 'idle' | 'working' | 'error' | 'offline',
                            type: agent.type,
                            username: agent.name,
                        }
                        if (index !== -1) {
                            const updatedAgents = [...$s.agents]
                            updatedAgents[index] = transformedAgent
                            $s.agents = updatedAgents
                        } else {
                            $s.agents = [...$s.agents, transformedAgent]
                        }
                    } else if (data.type === 'agent:deleted') {
                        $s.agents = $s.agents.filter((a) => a.id !== data.agentId)
                    } else if (data.type === 'agent:status') {
                        const index = $s.agents.findIndex((a) => a.id === data.agentId)
                        if (index !== -1) {
                            const updatedAgents = [...$s.agents]
                            updatedAgents[index] = {
                                ...updatedAgents[index],
                                currentTicketId: data.currentTicketId || null,
                                lastActivity: data.lastActivity || Date.now(),
                                status: data.status,
                            }
                            $s.agents = updatedAgents
                        }
                    }
                })

                ws.on('/anthropic', (data) => {
                    if (data.type === 'usage:updated' && data.usage) {
                        $s.anthropic.usage = {
                            count: data.usage.count || 0,
                            limit: data.usage.limit || 1_000_000,
                            loading: false,
                        }
                    }
                })
            } else {
                // Don't redirect to login if on public routes
                const currentUrl = window.location.pathname
                if (currentUrl !== '/docs' && !currentUrl.startsWith('/docs/') && currentUrl !== '/') {
                    route('/login')
                }
            }
        })()
    }, [])

    useEffect(() => {
        // Migrate old default width (200px) to new default (600px)
        if ($s.panels.context.width === 200) {
            $s.panels.context.width = 600
            store.save()
        }
    }, [])

    if ($s.profile.authenticated === null) {
        return null
    }

    // Allow public access to docs and board (if configured)
    const isPublicRoute = $s.env.url === '/docs' || $s.env.url === '/' || $s.env.url.startsWith('/docs/')
    // TODO: Get from config.public.showPlanning
    const showPublicBoard = true

    // Don't redirect to login if on public routes
    if ($s.profile.authenticated === false && !isPublicRoute && !showPublicBoard) {
        return <Login />
    }

    const handleRoute = async ({url}: {url: string}) => {
        $s.env.url = url

        // Redirect root to docs (public entry point)
        if (url === '/') {
            route('/docs', true)
        }
    }

    const handleClosePanel = () => {
        $s.selectedLane = null
        $s.panels.context.collapsed = true
        store.save()
    }

    const handleTicketCreated = async () => {
        // Reload tickets to get the new one
        const result = (await ws.get('/api/tickets')) as {tickets?: unknown}
        if (result.tickets) {
            $s.tickets = result.tickets as typeof $s.tickets
        }
    }

    return (
        <>
            <AppLayout
                context={
                    $s.selectedLane ? (
                        <PanelContext
                            collapsed={false}
                            defaultWidth={600}
                            maxWidth={1000}
                            minWidth={64}
                            onWidthChange={(width) => {
                                $s.panels.context.width = width
                                store.save()
                            }}
                            width={$s.panels.context.width === 200 ? undefined : $s.panels.context.width}
                        >
                            <TicketForm
                                initialStatus={$s.selectedLane}
                                onClose={handleClosePanel}
                                onSuccess={handleTicketCreated}
                            />
                        </PanelContext>
                    ) : null
                }
                menu={
                    <PanelMenu
                        actions={
                            $s.profile.authenticated ? (
                                <UserMenu
                                    collapsed={$s.panels.menu.collapsed}
                                    onLogout={async () => {
                                        const result = (await api.get('/api/logout')) as {
                                            admin?: boolean
                                            authenticated?: boolean
                                        }
                                        $s.profile.authenticated = result.authenticated || false
                                        $s.profile.admin = result.admin || false
                                        route('/docs')
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
                            ) : (
                                <div style={{padding: 'var(--spacer-2)'}}>
                                    <a href='/login' style={{color: 'var(--text-1)', textDecoration: 'none'}}>
                                        Login
                                    </a>
                                </div>
                            )
                        }
                        collapsed={$s.panels.menu.collapsed}
                        footer={
                            <div class='anthropic-usage'>
                                <span>Anthropic API Usage</span>
                                <Progress
                                    boundaries={[$s.anthropic.usage.count, $s.anthropic.usage.limit]}
                                    iso6391='en-gb'
                                    loading={$s.anthropic.usage.loading}
                                    percentage={
                                        $s.anthropic.usage.limit > 0 ? $s.anthropic.usage.count / $s.anthropic.usage.limit : 0
                                    }
                                />
                            </div>
                        }
                        LinkComponent={Link}
                        logoCommitHash={process.env.APP_COMMIT_HASH || ''}
                        logoHref='/board'
                        logoSrc='/public/img/logo.svg'
                        logoText='Nonlinear'
                        logoVersion={process.env.APP_VERSION || ''}
                        navigation={
                            <MenuGroup collapsed={$s.panels.menu.collapsed}>
                                <MenuItem
                                    active={$s.env.url === '/docs'}
                                    collapsed={$s.panels.menu.collapsed}
                                    href='/docs'
                                    icon='description'
                                    iconType='info'
                                    text='Documentation'
                                />
                                <MenuItem
                                    active={$s.env.url === '/board' || $s.env.url === '/'}
                                    collapsed={$s.panels.menu.collapsed}
                                    href='/board'
                                    icon='view_kanban'
                                    iconType='info'
                                    text='Development'
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
                    <Router onChange={handleRoute}>
                        <Route component={Docs} path='/docs' />
                        <Route component={Board} default path='/board' />
                        <Route component={Board} path='/' />
                        <Route
                            component={(props: {ticketId?: string}) => <TicketDetail ticketId={props.ticketId || ''} />}
                            path='/tickets/:ticketId'
                        />
                        <Route component={(props: {tabId?: string}) => <Settings tabId={props.tabId} />} path='/settings' />
                        <Route
                            component={(props: {tabId?: string}) => <Settings tabId={props.tabId} />}
                            path='/settings/:tabId'
                        />
                    </Router>
                </div>
            </AppLayout>
            <Notifications notifications={$s.notifications as Notification[]} />
        </>
    )
}
