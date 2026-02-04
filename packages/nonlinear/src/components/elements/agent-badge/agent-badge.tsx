import {AgentAvatar} from '../agent-avatar/agent-avatar'

interface AgentBadgeProps {
    agent: {
        avatar: string
        displayName: string
        id: string
        name: string
        status: 'idle' | 'working' | 'error' | 'offline'
        type: 'planner' | 'developer' | 'reviewer'
    }
    size?: 's' | 'd' | 'l'
    showStatus?: boolean
}

export const AgentBadge = ({agent, size = 'd', showStatus = true}: AgentBadgeProps) => {
    return (
        <div class='c-agent-badge'>
            <AgentAvatar agent={agent} size={size} showStatus={showStatus} />
            <span class='agent-name'>{agent.displayName || agent.name}</span>
        </div>
    )
}
