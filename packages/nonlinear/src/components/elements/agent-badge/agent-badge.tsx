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
    showStatus?: boolean
    size?: 's' | 'd' | 'l'
}

export const AgentBadge = ({agent, showStatus = true, size = 'd'}: AgentBadgeProps) => {
    return (
        <div class='c-agent-badge'>
            <AgentAvatar agent={agent} showStatus={showStatus} size={size} />
            <span class='agent-name'>{agent.displayName || agent.name}</span>
        </div>
    )
}
