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
    showStatus?: boolean
    showType?: boolean
    size?: 's' | 'd' | 'l'
}

export const AgentAvatar = ({agent, showStatus = true, showType = false, size = 'd'}: AgentAvatarProps) => {
    const avatarUrl = getAvatarUrl(agent.avatar, agent.id)

    const statusClass = {
        error: 'status-error',
        idle: 'status-idle',
        offline: 'status-offline',
        working: 'status-working',
    }[agent.status]

    const typeIcon = {
        developer: 'code',
        planner: 'priority_high',
        reviewer: 'rate_review',
    }[agent.type]

    return (
        <div class={classnames('c-agent-avatar', `size-${size}`)}>
            <div class={classnames('avatar-container', statusClass)}>
                <img alt={agent.displayName} class='avatar' src={avatarUrl} />
                {showStatus &&
                    <span class={classnames('status-indicator', statusClass)} />}
            </div>
            {showType &&
                <Icon class='type-icon' name={typeIcon} size='s' type='info' />}
        </div>
    )
}
