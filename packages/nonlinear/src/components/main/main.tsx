import {$s} from '@/app'
import {api, store, ws} from '@garage44/common/app'
import {Board, Docs, Settings, TicketDetail} from '@/components/pages'
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
import {TicketForm} from '@/components/elements/ticket-form/ticket-form'
import {Link, Router, route} from 'preact-router'
import {Login} from '@/components/pages/login/login'
import {useEffect} from 'preact/hooks'

export const Main = () => {
    useEffect(() => {
        (async() => {
            const context = await api.get('/api/context')

            /*
             * Check if user was authenticated - the response should have authenticated: true
             * Also check if we have user data (id, username) as an alternative indicator
             * This handles cases where authenticated might not be set but user data is present
             */
            const isAuthenticated = context.authenticated || (context.id && context.username)

            $s.profile.admin = context.admin || false
            $s.profile.authenticated = isAuthenticated || false
            if (context.id) $s.profile.id = context.id
            if (context.username) $s.profile.username = context.username
            if (context.profile) {
                $s.profile.avatar = context.profile.avatar || 'placeholder-1.png'
                $s.profile.displayName = context.profile.displayName || context.username || 'User'
            }

            if (isAuthenticated) {
                ws.connect()

                // Load initial data
                const ticketsResult = await ws.get('/api/tickets')
                if (ticketsResult.tickets) {
                    $s.tickets = ticketsResult.tickets
                }

                const reposResult = await ws.get('/api/repositories')
                if (reposResult.repositories) {
                    $s.repositories = reposResult.repositories
                }

                // Load Anthropic token usage
                const usageResult = await ws.get('/api/anthropic/usage')
                if (usageResult.usage) {
                    $s.anthropic.usage = {
                        count: usageResult.usage.count || 0,
                        limit: usageResult.usage.limit || 1000000,
                        loading: false,
                    }
                }

                const agentsResult = await ws.get('/api/agents')
                if (agentsResult.agents) {
                    $s.agents = agentsResult.agents.map((agent: {
                        avatar: string | null
                        created_at: number
                        currentTicketId: string | null
                        display_name: string | null
                        enabled: number
                        id: string
                        lastActivity: number
                        name: string
                        status: string
                        type: 'planner' | 'developer' | 'reviewer'
                    }) => ({
                        id: agent.id,
                        name: agent.name,
                        username: agent.name,
                        displayName: agent.display_name || `${agent.name} Agent`,
                        avatar: agent.avatar || 'placeholder-2.png',
                        status: (agent.status || 'idle') as 'idle' | 'working' | 'error' | 'offline',
                        type: agent.type,
                        config: '',
                        enabled: agent.enabled,
                        created_at: agent.created_at,
                        isAgent: true as const,
                        currentTicketId: agent.currentTicketId || null,
                        lastActivity: agent.lastActivity || agent.created_at,
                    }))
                }

                // Load label definitions
                const labelsResult = await ws.get('/api/labels')
                if (labelsResult.labels) {
                    $s.labelDefinitions = labelsResult.labels
                } {
                    // Transform agents into user-like objects
                    $s.agents = agentsResult.agents.map((agent: {
                        avatar: string | null
                        created_at: number
                        currentTicketId: string | null
                        display_name: string | null
                        enabled: number
                        id: string
                        lastActivity: number
                        name: string
                        status: string
                        type: 'planner' | 'developer' | 'reviewer'
                    }) => ({
                        id: agent.id,
                        name: agent.name,
                        username: agent.name,
                        displayName: agent.display_name || `${agent.name} Agent`,
                        avatar: agent.avatar || 'placeholder-2.png',
                        status: (agent.status || 'idle') as 'idle' | 'working' | 'error' | 'offline',
                        type: agent.type,
                        config: '',
                        enabled: agent.enabled,
                        created_at: agent.created_at,
                        isAgent: true as const,
                        currentTicketId: agent.currentTicketId || null,
                        lastActivity: agent.lastActivity || agent.created_at,
                    }))
                }

                // Subscribe to real-time updates
                ws.on('/tickets', (data) => {
                    if (data.type === 'ticket:created' || data.type === 'ticket:updated') {
                        // Update ticket in state - create new array for DeepSignal reactivity
                        const index = $s.tickets.findIndex((t) => t.id === data.ticket.id)
                        if (index >= 0) {
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
                        if (index >= 0) {
                            $s.repositories[index] = data.repository
                        } else {
                            $s.repositories = [...$s.repositories, data.repository]
                        }
                    } else if (data.type === 'repository:deleted') {
                        $s.repositories = $s.repositories.filter((r) => r.id !== data.repositoryId)
                    }
                })

                ws.on('/agents', (data) => {
                    if (data.type === 'agent:created' || data.type === 'agent:updated') {
                        const agent = data.agent
                        const index = $s.agents.findIndex((a) => a.id === agent.id)
                        const transformedAgent = {
                            id: agent.id,
                            name: agent.name,
                            username: agent.name,
                            displayName: agent.display_name || `${agent.name} Agent`,
                            avatar: agent.avatar || 'placeholder-2.png',
                            status: (agent.status || 'idle') as 'idle' | 'working' | 'error' | 'offline',
                            type: agent.type,
                            config: agent.config || '',
                            enabled: agent.enabled,
                            created_at: agent.created_at,
                            isAgent: true as const,
                            currentTicketId: null,
                            lastActivity: Date.now(),
                        }
                        if (index >= 0) {
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
                        if (index >= 0) {
                            const updatedAgents = [...$s.agents]
                            updatedAgents[index] = {
                                ...updatedAgents[index],
                                status: data.status,
                                currentTicketId: data.currentTicketId || null,
                                lastActivity: data.lastActivity || Date.now(),
                            }
                            $s.agents = updatedAgents
                        }
                    }
                })

                ws.on('/anthropic', (data) => {
                    if (data.type === 'usage:updated' && data.usage) {
                        $s.anthropic.usage = {
                            count: data.usage.count || 0,
                            limit: data.usage.limit || 1000000,
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
    const showPublicBoard = true // TODO: Get from config.public.showPlanning

    // Don't redirect to login if on public routes
    if ($s.profile.authenticated === false && !isPublicRoute && !showPublicBoard) {
        return <Login />
    }

    const handleRoute = async({url}: {url: string}) => {
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

    const handleTicketCreated = async() => {
        // Reload tickets to get the new one
        const result = await ws.get('/api/tickets')
        if (result.tickets) {
            $s.tickets = result.tickets
        }
    }

    return <>
        <AppLayout
            context={
                $s.selectedLane ?

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
                            </PanelContext> :
                    null
            }
            menu={(
                <PanelMenu
                    actions={(
                        $s.profile.authenticated ? (
                            <UserMenu
                                collapsed={$s.panels.menu.collapsed}
                                onLogout={async() => {
                                    const result = await api.get('/api/logout')
                                    $s.profile.authenticated = result.authenticated || false
                                    $s.profile.admin = result.admin || false
                                    route('/docs')
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
                        ) : (
                            <div style="padding: var(--spacer-2);">
                                <Link href="/login" style="color: var(--text-1); text-decoration: none;">
                                    Login
                                </Link>
                            </div>
                        )
                      )}
                    collapsed={$s.panels.menu.collapsed}
                    footer={
                        <div class='anthropic-usage'>
                            <span>Anthropic API Usage</span>
                            <Progress
                                boundaries={[$s.anthropic.usage.count, $s.anthropic.usage.limit]}
                                iso6391='en-gb'
                                loading={$s.anthropic.usage.loading}
                                percentage={$s.anthropic.usage.limit > 0 ? $s.anthropic.usage.count / $s.anthropic.usage.limit : 0}
                            />
                        </div>
                    }
                    LinkComponent={Link}
                    logoCommitHash={process.env.APP_COMMIT_HASH || ''}
                    logoHref='/board'
                    logoSrc='/public/img/logo.svg'
                    logoText='Nonlinear'
                    logoVersion={process.env.APP_VERSION || ''}
                    navigation={(
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
                                active={$s.env.url === '/board' || ($s.env.url === '/' && $s.env.url !== '/docs')}
                                collapsed={$s.panels.menu.collapsed}
                                href='/board'
                                icon='view_kanban'
                                iconType='info'
                                text='Planning'
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
                    <Docs path='/docs' />
                    <Board default path='/board' />
                    <Board path='/' />
                    <TicketDetail path='/tickets/:ticketId' />
                    <Settings path='/settings' />
                </Router>
            </div>
        </AppLayout>
        <Notifications notifications={$s.notifications} />
    </>
}
