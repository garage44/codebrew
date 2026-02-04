import {$s} from '@/app'
import {AgentAvatar, AgentBadge} from '@/components/elements'
import {Button, Icon} from '@garage44/common/components'
import {ws, notifier} from '@garage44/common/app'
import {useEffect} from 'preact/hooks'

export function Agents() {
    useEffect(() => {
        // Load agents if not already loaded
        if ($s.agents.length === 0) {
            (async() => {
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
                            status: string
                            type: 'prioritizer' | 'developer' | 'reviewer'
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
                } catch(error) {
                    notifier.notify({
                        message: `Failed to load agents: ${error instanceof Error ? error.message : String(error)}`,
                        type: 'error',
                    })
                }
            })()
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

    const getStatusLabel = (status: string) => {
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
                                        <span class={`agent-status status-${agent.status}`}>
                                            {getStatusLabel(agent.status)}
                                        </span>
                                        {agent.currentTicketId &&
                                            <span class='agent-activity'>
                                                Working on ticket: {agent.currentTicketId}
                                            </span>}
                                    </div>
                                </div>
                            </div>
                            <div class='agent-actions'>
                                <Button
                                    onClick={() => handleToggleAgent(agent.id, agent.enabled === 1)}
                                    variant={agent.enabled === 1 ? 'secondary' : 'primary'}
                                >
                                    {agent.enabled === 1 ? 'Disable' : 'Enable'}
                                </Button>
                                <Button
                                    disabled={agent.status === 'working'}
                                    onClick={() => handleTriggerAgent(agent.id)}
                                    variant='ghost'
                                >
                                    <Icon name='play_arrow' size='d' type='info' />
                                    Trigger
                                </Button>
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    )
}
