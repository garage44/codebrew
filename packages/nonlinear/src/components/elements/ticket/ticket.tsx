import {$s} from '@/app'
import {AgentBadge} from '../agent-badge/agent-badge'
import {Icon} from '@garage44/common/components'
import {route} from 'preact-router'
import {useState} from 'preact/hooks'

interface TicketCardProps {
    ticket: {
        assignee_id: string | null
        assignee_type: string | null
        assignees: Array<{assignee_id: string; assignee_type: 'agent' | 'human'}>
        branch_name: string | null
        description: string | null
        id: string
        labels: string[]
        merge_request_id: string | null
        priority: number | null
        repository_name: string | null
        status: string
        title: string
    }
}

export const TicketCard = ({ticket}: TicketCardProps) => {
    const [expanded, _setExpanded] = useState(false)

    const getPriorityColor = (priority: number | null) => {
        if (!priority) return 'var(--surface-6)'
        if (priority >= 80) return 'var(--danger-6)'
        if (priority >= 60) return 'var(--warning-6)'
        return 'var(--primary-6)'
    }

    const handleClick = () => {
        route(`/tickets/${ticket.id}`)
    }

    return (
        <div class='c-ticket-card' onClick={handleClick}>
            <div class='header'>
                <h3 class='title'>{ticket.title}</h3>
                {ticket.priority !== null &&
                    <div
                        class='priority'
                        style={{color: getPriorityColor(ticket.priority)}}
                    >
                        P{ticket.priority}
                    </div>}
            </div>
            {(ticket.repository_name || (ticket.labels && ticket.labels.length > 0)) &&
                <div class='labels'>
                    {ticket.repository_name &&
                        <span class='repo-badge'>
                            <Icon name='folder_plus_outline' size='s' type='info' />
                            <span>{ticket.repository_name}</span>
                        </span>}
                    {ticket.labels && ticket.labels.slice(0, 3).map((label) => {
                        const labelDef = $s.labelDefinitions.find((def) => def.name === label)
                        const labelColor = labelDef?.color || 'var(--info-6)'
                        return (
                            <span
                                class='label-badge'
                                key={label}
                                style={{
                                    backgroundColor: labelColor,
                                    borderColor: labelColor,
                                }}
                            >
                                {label}
                            </span>
                        )
                    })}
                    {ticket.labels && ticket.labels.length > 3 &&
                        <span class='label-more'>+{ticket.labels.length - 3}</span>}
                </div>}
            {(ticket.assignees && ticket.assignees.length > 0) || ticket.assignee_id ?
                <div class='assignees'>
                    {(ticket.assignees || []).slice(0, 2).map((assignee) => {
                        if (assignee.assignee_type === 'agent') {
                            const agent = $s.agents.find((a) => a.id === assignee.assignee_id || a.name === assignee.assignee_id)
                            if (agent) {
                                return (
                                    <div class='assignee' key={`${assignee.assignee_type}-${assignee.assignee_id}`}>
                                        <AgentBadge agent={agent} size='s' />
                                    </div>
                                )
                            }
                        }
                        return (
                            <div class='assignee' key={`${assignee.assignee_type}-${assignee.assignee_id}`}>
                                <Icon name='person' size='d' type='info' />
                                <span>{assignee.assignee_id}</span>
                            </div>
                        )
                    })}
                    {/* Backward compatibility: show single assignee if assignees array is empty */}
                    {(!ticket.assignees || ticket.assignees.length === 0) && ticket.assignee_id &&
                        (() => {
                            if (ticket.assignee_type === 'agent') {
                                const agent = $s.agents.find((a) => a.id === ticket.assignee_id || a.name === ticket.assignee_id)
                                if (agent) {
                                    return (
                                        <div class='assignee'>
                                            <AgentBadge agent={agent} size='s' />
                                        </div>
                                    )
                                }
                            }
                            return (
                                <div class='assignee'>
                                    <Icon name='person' size='d' type='info' />
                                    <span>{ticket.assignee_type === 'agent' ? '🤖' : '👤'} {ticket.assignee_id}</span>
                                </div>
                            )
                        })()}
                    {ticket.assignees && ticket.assignees.length > 2 &&
                        <span class='assignee-more'>+{ticket.assignees.length - 2}</span>}
                </div> :
                null}
            {ticket.branch_name &&
                <div class='branch'>
                    <Icon name='code' size='d' type='info' />
                    <span>{ticket.branch_name}</span>
                </div>}
            {expanded && ticket.description &&
                <div class='description'>
                    {ticket.description}
                </div>}
            {expanded && ticket.merge_request_id &&
                <div class='mr'>
                    <a href={`#mr-${ticket.merge_request_id}`} rel='noopener noreferrer' target='_blank'>
                        View MR #{ticket.merge_request_id}
                    </a>
                </div>}
        </div>
    )
}
