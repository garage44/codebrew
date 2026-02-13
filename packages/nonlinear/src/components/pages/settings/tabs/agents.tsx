import {ws, notifier} from '@garage44/common/app'
import {Button, Icon} from '@garage44/common/components'

import {$s} from '@/app'
import {AgentAvatar} from '@/components/elements'

export function Agents() {
    /*
     * Agents are loaded globally in main.tsx and stored in $s.agents
     * This component just displays $s.agents - no need to load separately
     * WebSocket updates automatically keep $s.agents in sync via watched state pattern
     */

    const handleStartService = async (agentId: string) => {
        try {
            await ws.post(`/api/agents/${agentId}/service/start`, {})

            notifier.notify({
                message: 'Agent service starting',
                type: 'success',
            })

            // No polling needed - WebSocket broadcast will update UI instantly when service connects
        } catch (error) {
            notifier.notify({
                message: `Failed to start service: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleStopService = async (agentId: string) => {
        try {
            await ws.post(`/api/agents/${agentId}/service/stop`, {})

            notifier.notify({
                message: 'Agent service stopping',
                type: 'success',
            })

            // No polling needed - WebSocket broadcast will update UI instantly when service disconnects
        } catch (error) {
            notifier.notify({
                message: `Failed to stop service: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const getStatusLabel = (status: string) => {
        // Status already reflects online/offline state (set by API based on serviceOnline)
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

    const isServiceOnline = (status: string) => {
        // Service is online if status is not 'offline'
        return status !== 'offline'
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
            <p class='description'>Manage AI agents that automatically process tickets. Agents appear as users in the system.</p>

            <div class='list'>
                {$s.agents.length === 0 ? (
                    <p class='empty'>No agents configured</p>
                ) : (
                    $s.agents.map((agent) => (
                        <div class='agent' key={agent.id}>
                            <div class='agent-header'>
                                <AgentAvatar
                                    agent={{
                                        avatar: agent.avatar || 'placeholder-1.png',
                                        displayName: agent.display_name || agent.name,
                                        id: agent.id,
                                        status: (agent.status || 'idle') as 'idle' | 'working' | 'error' | 'offline',
                                        type: ((agent.type as string) === 'prioritizer' ? 'planner' : agent.type) as
                                            | 'developer'
                                            | 'planner'
                                            | 'reviewer',
                                    }}
                                    showStatus
                                    showType
                                    size='l'
                                />
                                <div class='agent-info'>
                                    <h3>{agent.display_name || agent.name}</h3>
                                    <div class='status-indicator-group'>
                                        <span
                                            class={`service-indicator ${isServiceOnline(agent.status) ? 'online' : 'offline'}`}
                                            title={isServiceOnline(agent.status) ? 'Service Online' : 'Service Offline'}
                                        />
                                        <span class={`agent-status status-${agent.status}`}>{getStatusLabel(agent.status)}</span>
                                    </div>
                                    <div class='agent-meta'>
                                        <span class='agent-type'>{getTypeLabel(agent.type)}</span>
                                    </div>
                                    {agent.currentTicketId && (
                                        <div class='agent-activity'>Working on ticket: {agent.currentTicketId}</div>
                                    )}
                                    {isServiceOnline(agent.status) && agent.stats && (
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
                                {isServiceOnline(agent.status) ? (
                                    <Button onClick={() => handleStopService(agent.id)} variant='default'>
                                        <Icon name='unrecord' size='d' type='info' />
                                        Stop Service
                                    </Button>
                                ) : (
                                    <Button onClick={() => handleStartService(agent.id)} variant='default'>
                                        <Icon name='play' size='d' type='info' />
                                        Start Service
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
