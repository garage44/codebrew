import {getAvatarUrl} from '@garage44/common/lib/avatar'
import {Icon} from '@garage44/common/components'
import classnames from 'classnames'

interface AgentAvatarProps {
    agent: {
        avatar: string
        displayName: string
        id: string
        status: 'idle' | 'working' | 'error' | 'offline'
        type: 'planner' | 'developer' | 'reviewer'
    }
    size?: 's' | 'd' | 'l'
    showStatus?: boolean
    showType?: boolean
}

export const AgentAvatar = ({agent, size = 'd', showStatus = true, showType = false}: AgentAvatarProps) => {
    const avatarUrl = getAvatarUrl(agent.avatar, agent.id)

    const statusClass = {
        idle: 'status-idle',
        working: 'status-working',
        error: 'status-error',
        offline: 'status-offline',
    }[agent.status]

    const typeIcon = {
        planner: 'priority_high',
        developer: 'code',
        reviewer: 'rate_review',
    }[agent.type]

    return (
        <div class={classnames('c-agent-avatar', `size-${size}`)}>
            <div class={classnames('avatar-container', statusClass)}>
                <img alt={agent.displayName} class='avatar' src={avatarUrl} />
                {showStatus && (
                    <span class={classnames('status-indicator', statusClass)} />
                )}
            </div>
            {showType && (
                <Icon class='type-icon' name={typeIcon} size='s' type='info' />
            )}
        </div>
    )
}
