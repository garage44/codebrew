import {$s} from '@/app'
import {AgentAvatar, AgentBadge} from '@/components/elements'
import {Button, Icon} from '@garage44/common/components'
import {ws, notifier} from '@garage44/common/app'
import {useEffect} from 'preact/hooks'

export function Agents() {
    // Load agents function - defined outside useEffect so it can be called from handlers
    const loadAgents = async() => {
        try {
            const result = await ws.get('/api/agents')
            if (result.agents) {
                $s.agents = result.agents.map((agent: {
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
                    type: 'prioritizer' | 'developer' | 'reviewer'
                    }) => {
                        return {
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
                        serviceOnline: agent.serviceOnline ?? false,
                        stats: agent.stats || {
                            completed: 0,
                            failed: 0,
                            pending: 0,
                            processing: 0,
                        },
                    }
                })
            }
        } catch(error) {
            notifier.notify({
                message: `Failed to load agents: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    useEffect(() => {
        // Load agents initially
        loadAgents()

        // Listen for instant service online/offline updates
        const handleAgentServiceUpdate = (data: {agentId: string; type: string; online?: boolean}) => {
            if (data.type === 'agent:service-online' || data.type === 'agent:service-offline') {
                // Reload agents immediately when service status changes
                loadAgents()
            }
        }

        ws.on('/agents', handleAgentServiceUpdate)

        return () => {
            ws.off('/agents', handleAgentServiceUpdate)
        }
    }, [])

    const handleToggleAgent = async(agentId: string, enabled: boolean) => {
        try {
            await ws.put(`/api/agents/${agentId}`, {
                enabled: !enabled,
            })

            notifier.notify({
                message: `Agent ${enabled ? 'disabled' : 'enabled'}`,
                type: 'success',
            })
        } catch(error) {
            notifier.notify({
                message: `Failed to toggle agent: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleTriggerAgent = async(agentId: string) => {
        try {
            await ws.post(`/api/agents/${agentId}/trigger`, {})

            notifier.notify({
                message: 'Agent triggered',
                type: 'success',
            })
        } catch(error) {
            notifier.notify({
                message: `Failed to trigger agent: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleStartService = async(agentId: string) => {
        try {
            await ws.post(`/api/agents/${agentId}/service/start`, {})

            notifier.notify({
                message: 'Agent service starting',
                type: 'success',
            })

            // No polling needed - WebSocket broadcast will update UI instantly when service connects
        } catch(error) {
            notifier.notify({
                message: `Failed to start service: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleStopService = async(agentId: string) => {
        try {
            await ws.post(`/api/agents/${agentId}/service/stop`, {})

            notifier.notify({
                message: 'Agent service stopping',
                type: 'success',
            })

            // Reload agents to get updated status
            setTimeout(async() => {
                const result = await ws.get('/api/agents')
                if (result.agents) {
                    const agent = result.agents.find((a: {id: string}) => a.id === agentId)
                    if (agent) {
                        const index = $s.agents.findIndex((a) => a.id === agentId)
                        if (index >= 0) {
                            const updatedAgents = [...$s.agents]
                            updatedAgents[index] = {
                                ...updatedAgents[index],
                                serviceOnline: agent.serviceOnline || false,
                                stats: agent.stats || updatedAgents[index].stats,
                            }
                            $s.agents = updatedAgents
                        }
                    }
                }
            }, 1000)
        } catch(error) {
            notifier.notify({
                message: `Failed to stop service: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const getStatusLabel = (status: string, serviceOnline: boolean) => {
        // If service is offline, show "Offline" regardless of agent status
        if (!serviceOnline) {
            return 'Offline'
        }

        switch (status) {
            case 'idle':
                return 'Idle'
            case 'working':
                return 'Working'
            case 'error':
                return 'Error'
            case 'offline':
                return 'Offline'
            default:
                return status
        }
    }

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'planner':
                return 'Planner'
            case 'developer':
                return 'Developer'
            case 'reviewer':
                return 'Reviewer'
            default:
                return type
        }
    }

    return (
        <div class='c-agents-settings'>
            <h2>AI Agents</h2>
            <p class='description'>
                Manage AI agents that automatically process tickets. Agents appear as users in the system.
            </p>

            <div class='list'>
                {$s.agents.length === 0 ?
                    <p class='empty'>No agents configured</p> :
                    $s.agents.map((agent) => (
                        <div class='agent' key={agent.id}>
                            <div class='agent-header'>
                                <AgentAvatar agent={agent} size='l' showStatus showType />
                                <div class='agent-info'>
                                    <h3>{agent.displayName}</h3>
                                    <div class='agent-meta'>
                                        <span class='agent-type'>{getTypeLabel(agent.type)}</span>
                                        <span class={`service-indicator ${agent.serviceOnline ? 'online' : 'offline'}`} title={agent.serviceOnline ? 'Service Online' : 'Service Offline'} />
                                        <span class={`agent-status status-${agent.serviceOnline ? agent.status : 'offline'}`}>
                                            {getStatusLabel(agent.status, agent.serviceOnline)}
                                        </span>
                                        {agent.currentTicketId &&
                                            <span class='agent-activity'>
                                                Working on ticket: {agent.currentTicketId}
                                            </span>}
                                    </div>
                                    {agent.serviceOnline && agent.stats && (
                                        <div class='agent-stats'>
                                            <span class='stat'>
                                                <span class='stat-label'>Pending:</span>
                                                <span class='stat-value'>{agent.stats.pending}</span>
                                            </span>
                                            <span class='stat'>
                                                <span class='stat-label'>Processing:</span>
                                                <span class='stat-value'>{agent.stats.processing}</span>
                                            </span>
                                            <span class='stat'>
                                                <span class='stat-label'>Completed:</span>
                                                <span class='stat-value'>{agent.stats.completed}</span>
                                            </span>
                                            <span class='stat'>
                                                <span class='stat-label'>Failed:</span>
                                                <span class='stat-value'>{agent.stats.failed}</span>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div class='agent-actions'>
                                {agent.serviceOnline ? (
                                    <Button
                                        onClick={() => handleStopService(agent.id)}
                                        variant='secondary'
                                    >
                                        <Icon name='unrecord' size='d' type='info' />
                                        Stop Service
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => handleStartService(agent.id)}
                                        variant='primary'
                                    >
                                        <Icon name='play_arrow' size='d' type='info' />
                                        Start Service
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    )
}
