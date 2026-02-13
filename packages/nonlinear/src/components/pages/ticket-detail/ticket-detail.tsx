import {ws, notifier} from '@garage44/common/app'
import {Button, FieldSelect, FieldText, FieldTextarea, Icon} from '@garage44/common/components'
import {deepSignal} from 'deepsignal'
import mermaid from 'mermaid'
import {route} from 'preact-router'
import {useEffect, useRef, useState} from 'preact/hooks'

import {$s} from '@/app'
import {AgentBadge} from '@/components/elements'
import {MentionAutocomplete} from '@/components/elements/mention-autocomplete/mention-autocomplete'
import {UserBadge} from '@/components/elements/user-badge/user-badge'
import {renderMarkdown} from '@/lib/markdown.ts'

// Load label definitions on component mount
const loadLabelDefinitions = async () => {
    try {
        const result = await ws.get('/api/labels')
        if (result.labels) {
            $s.labelDefinitions = result.labels as typeof $s.labelDefinitions
        }
    } catch {
        // Silently fail - labels will load on next attempt
    }
}

const commentState = deepSignal({
    content: '',
})

const createEditState = () =>
    deepSignal({
        description: '',
        title: '',
    })

const createAssigneeState = () =>
    deepSignal({
        assignee_id: '',
        assignee_type: '' as '' | 'agent' | 'human',
    })

const createLabelsState = () =>
    deepSignal({
        labels: [] as string[],
        newLabel: '',
    })

interface TicketDetailProps {
    ticketId?: string
}

interface Ticket {
    assignee_id: string | null
    assignee_type: 'agent' | 'human' | null
    assignees: {assignee_id: string; assignee_type: 'agent' | 'human'}[]
    description: string | null
    id: string
    labels: string[]
    status: string
    title: string
}

interface Comment {
    author_id: string
    author_type: 'agent' | 'human'
    content: string
    created_at: number
    id: string
    responding_to?: string | null
    status?: 'generating' | 'completed' | 'failed'
    updated_at?: number
}

export const TicketDetail = ({ticketId}: TicketDetailProps) => {
    const [ticket, setTicket] = useState<Ticket | null>(null)
    const [comments, setComments] = useState<Comment[]>([])
    const [loading, setLoading] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const editStateRef = useRef(createEditState())
    const editState = editStateRef.current
    const assigneeStateRef = useRef(createAssigneeState())
    const assigneeState = assigneeStateRef.current
    const labelsStateRef = useRef(createLabelsState())
    const labelsState = labelsStateRef.current
    const commentTextareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        // Load label definitions if not already loaded
        if ($s.labelDefinitions.length === 0) {
            loadLabelDefinitions()
        }

        if (!ticketId) {
            const id = $s.selectedTicket || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '')
            if (!id) {
                route('/board')
                return
            }
            loadTicket(id)
        } else {
            loadTicket(ticketId)
        }

        // Listen for comment updates and ticket updates
        const handleUpdate = (data: {comment?: Comment; ticket?: Ticket; ticketId?: string; type: string}) => {
            const currentTicketId =
                ticketId || $s.selectedTicket || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '')
            if (data.ticketId === currentTicketId || (data.ticket && data.ticket.id === currentTicketId)) {
                if (data.type === 'comment:created' && data.comment) {
                    // Add new comment (including placeholder comments with generating status)
                    setComments((prev) => {
                        // Check if comment already exists
                        const exists = prev.some((c) => c.id === data.comment!.id)
                        if (exists) {
                            return prev
                        }
                        return [...prev, data.comment!]
                    })
                } else if (data.type === 'comment:updated' && data.comment) {
                    // Update existing comment content (streaming update)
                    setComments((prev) => prev.map((c) => (c.id === data.comment!.id ? {...c, ...data.comment!} : c)))
                } else if (data.type === 'comment:completed' && data.comment) {
                    // Finalize comment (mark as completed)
                    setComments((prev) =>
                        prev.map((c) => (c.id === data.comment!.id ? {...c, ...data.comment!, status: 'completed' as const} : c)),
                    )
                } else if (data.type === 'ticket:updated' && data.ticket) {
                    // Update ticket in state
                    setTicket(data.ticket)
                    editState.title = data.ticket.title
                    editState.description = data.ticket.description || ''
                    assigneeState.assignee_type = data.ticket.assignee_type || ''
                    assigneeState.assignee_id = data.ticket.assignee_id || ''
                    labelsState.labels = data.ticket.labels || []
                }
            }
        }

        ws.on('/tickets', handleUpdate)

        return () => {
            ws.off('/tickets', handleUpdate)
        }
    }, [ticketId])

    // Render Mermaid diagrams when comments or description change
    useEffect(() => {
        // Small delay to ensure DOM is updated
        const timeoutId = setTimeout(() => {
            const mermaidElements = document.querySelectorAll('.c-ticket-detail .mermaid')
            if (mermaidElements && mermaidElements.length > 0) {
                mermaid
                    .run({
                        nodes: [...mermaidElements] as HTMLElement[],
                    })
                    .catch((error) => {
                        // eslint-disable-next-line no-console
                        console.error('Error rendering mermaid diagrams:', error)
                    })
            }
        }, 100)

        return () => {
            clearTimeout(timeoutId)
        }
    }, [comments, ticket])

    const loadTicket = async (id: string) => {
        setLoading(true)
        try {
            const result = await ws.get(`/api/tickets/${id}`)
            if (result.ticket) {
                setTicket(result.ticket as Ticket)
                // Update edit state when ticket loads
                editState.title = (result.ticket as Ticket).title
                editState.description = (result.ticket as Ticket).description || ''
                // Update assignee state
                assigneeState.assignee_type = (result.ticket as Ticket).assignee_type || ''
                assigneeState.assignee_id = (result.ticket as Ticket).assignee_id || ''
                // Update labels state
                labelsState.labels = (result.ticket as Ticket).labels || []
            }
            if (result.comments) {
                setComments(result.comments as Comment[])
            }
        } catch (error) {
            notifier.notify({
                message: `Failed to load ticket: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        } finally {
            setLoading(false)
        }
    }

    const handleAddComment = async () => {
        if (!commentState.content.trim() || !ticket) {
            return
        }

        // Extract @mentions from comment
        const mentionRegex = /@(\w+)/g
        const mentions: string[] = []
        let match
        while ((match = mentionRegex.exec(commentState.content)) !== null) {
            mentions.push(match[1])
        }

        try {
            await ws.post(`/api/tickets/${ticket.id}/comments`, {
                author_id: $s.profile.username || 'user',
                author_type: 'human',
                content: commentState.content,
                mentions: mentions.length > 0 ? mentions : undefined,
            })

            commentState.content = ''
            await loadTicket(ticket.id)

            notifier.notify({
                message: 'Comment added',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to add comment: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleApprove = async () => {
        if (!ticket) {
            return
        }

        try {
            await ws.post(`/api/tickets/${ticket.id}/approve`, {})

            notifier.notify({
                message: 'Ticket approved',
                type: 'success',
            })

            await loadTicket(ticket.id)
        } catch (error) {
            notifier.notify({
                message: `Failed to approve ticket: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleReopen = async () => {
        if (!ticket) {
            return
        }

        const reason = prompt('Why are you reopening this ticket?')
        if (!reason) {
            return
        }

        try {
            await ws.post(`/api/tickets/${ticket.id}/reopen`, {
                reason,
            })

            notifier.notify({
                message: 'Ticket reopened',
                type: 'success',
            })

            await loadTicket(ticket.id)
        } catch (error) {
            notifier.notify({
                message: `Failed to reopen ticket: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleRequestRefinement = async () => {
        if (!ticket) {
            return
        }

        // Find PlannerAgent
        const plannerAgent = $s.agents.find((a) => a.type === 'planner' && a.enabled === 1)

        if (!plannerAgent) {
            notifier.notify({
                message: 'No enabled PlannerAgent found',
                type: 'error',
            })
            return
        }

        try {
            await ws.post(`/api/agents/${plannerAgent.id}/trigger`, {
                ticket_id: ticket.id,
            })

            notifier.notify({
                message: 'Refinement requested. The PlannerAgent will analyze and update the ticket shortly.',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to trigger refinement: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const getAssigneeOptions = () => {
        if (!ticket) {
            return []
        }

        // Get currently assigned IDs to filter them out
        const currentAssigneeIds = new Set((ticket.assignees || []).map((a) => a.assignee_id))

        if (assigneeState.assignee_type === 'agent') {
            return $s.agents
                .filter((agent) => {
                    // Filter out disabled agents
                    if (agent.enabled !== 1) {
                        return false
                    }
                    // Filter out already assigned agents (agents use their name as assignee_id)
                    return !currentAssigneeIds.has(agent.name) && !currentAssigneeIds.has(agent.id)
                })
                .map((agent) => ({
                    // Use agent.name as id since that's what agents use when assigning themselves
                    id: agent.name,
                    name: `${agent.display_name || agent.name || 'Unknown'} (${agent.type})`,
                }))
        }
        if (assigneeState.assignee_type === 'human') {
            // For now, return empty - would need user list
            return []
        }
        return []
    }

    const getLabelSuggestions = () => {
        const query = labelsState.newLabel.trim().toLowerCase()
        if (!query) {
            return $s.labelDefinitions
        }

        return $s.labelDefinitions.filter(
            (def) => def.name.toLowerCase().includes(query) && !labelsState.labels.includes(def.name),
        )
    }

    const handleAddLabel = async (labelName?: string) => {
        if (!ticket) {
            return
        }

        const labelToAdd = (labelName || labelsState.newLabel.trim()).toLowerCase()
        if (!labelToAdd) {
            return
        }

        // Check if label definition exists, if not create it
        let labelDef = $s.labelDefinitions.find((def) => def.name.toLowerCase() === labelToAdd)
        if (!labelDef) {
            // Create new label definition with default color
            try {
                const result = await ws.post('/api/labels', {
                    color: 'var(--info-6)',
                    name: labelToAdd,
                })
                if (result.label) {
                    $s.labelDefinitions = [...$s.labelDefinitions, result.label]
                    labelDef = result.label
                }
            } catch (error) {
                notifier.notify({
                    message: `Failed to create label definition: ${error instanceof Error ? error.message : String(error)}`,
                    type: 'error',
                })
                return
            }
        }

        const labelNameToAdd = labelDef.name
        if (labelsState.labels.includes(labelNameToAdd)) {
            notifier.notify({
                message: 'Label already added',
                type: 'warn',
            })
            labelsState.newLabel = ''
            return
        }

        try {
            const updatedLabels = [...labelsState.labels, labelNameToAdd]
            await ws.put(`/api/tickets/${ticket.id}`, {
                labels: updatedLabels,
            })

            labelsState.labels = updatedLabels
            labelsState.newLabel = ''

            notifier.notify({
                message: 'Label added',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to add label: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleRemoveLabel = async (label: string) => {
        if (!ticket) {
            return
        }

        try {
            const updatedLabels = labelsState.labels.filter((l) => l !== label)
            await ws.put(`/api/tickets/${ticket.id}`, {
                labels: updatedLabels,
            })

            labelsState.labels = updatedLabels

            notifier.notify({
                message: 'Label removed',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to remove label: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleAddAssignee = async (assigneeType: 'agent' | 'human', assigneeId: string) => {
        if (!ticket) {
            return
        }

        try {
            const currentAssignees = ticket.assignees || []
            const exists = currentAssignees.some((a) => a.assignee_type === assigneeType && a.assignee_id === assigneeId)

            if (exists) {
                notifier.notify({
                    message: 'Assignee already added',
                    type: 'warn',
                })
                return
            }

            const updatedAssignees = [
                ...currentAssignees,
                {
                    assignee_id: assigneeId,
                    assignee_type: assigneeType,
                },
            ]

            const result = await ws.put(`/api/tickets/${ticket.id}`, {
                assignees: updatedAssignees,
            })

            // Update local state immediately from response
            if (result && result.ticket) {
                setTicket(result.ticket as Ticket)
                labelsState.labels = (result.ticket as Ticket).labels || []
            } else {
                // If response doesn't have ticket, reload from server
                await loadTicket(ticket.id)
            }

            notifier.notify({
                message: 'Assignee added',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to add assignee: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleRemoveAssignee = async (assigneeType: 'agent' | 'human', assigneeId: string) => {
        if (!ticket) {
            return
        }

        try {
            const currentAssignees = ticket.assignees || []
            const updatedAssignees = currentAssignees.filter(
                (a) => !(a.assignee_type === assigneeType && a.assignee_id === assigneeId),
            )

            await ws.put(`/api/tickets/${ticket.id}`, {
                assignees: updatedAssignees,
            })

            await loadTicket(ticket.id)

            notifier.notify({
                message: 'Assignee removed',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to remove assignee: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleSaveEdit = async () => {
        if (!ticket) {
            return
        }

        try {
            await ws.put(`/api/tickets/${ticket.id}`, {
                description: editState.description || null,
                title: editState.title,
            })

            notifier.notify({
                message: 'Ticket updated',
                type: 'success',
            })

            setIsEditing(false)
            await loadTicket(ticket.id)
        } catch (error) {
            notifier.notify({
                message: `Failed to update ticket: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleCancelEdit = () => {
        if (ticket) {
            editState.title = ticket.title
            editState.description = ticket.description || ''
        }
        setIsEditing(false)
    }

    if (loading) {
        return <div class='c-ticket-detail'>Loading...</div>
    }

    if (!ticket) {
        return <div class='c-ticket-detail'>Ticket not found</div>
    }

    return (
        <div class='c-ticket-detail'>
            <div class='header'>
                <div class='header-top'>
                    <Button onClick={() => route('/board')} type='default'>
                        <Icon name='chevron_left' size='c' type='info' />
                        Back to Board
                    </Button>
                    {!isEditing && (
                        <div class='header-actions'>
                            <Button onClick={handleRequestRefinement} type='default'>
                                <Icon name='refresh' size='c' type='info' />
                                Request Refinement
                            </Button>
                            <Button onClick={() => setIsEditing(true)} type='default'>
                                <Icon name='edit' size='c' type='info' />
                                Edit
                            </Button>
                        </div>
                    )}
                </div>
                {isEditing ? (
                    <div class='edit-title'>
                        <FieldText autofocus model={editState.$title} placeholder='Enter ticket title' />
                    </div>
                ) : (
                    <h1>{ticket.title}</h1>
                )}
                <div class='status'>
                    <span class={`status-badge status-${ticket.status}`}>{ticket.status}</span>
                </div>
                {ticket.labels && ticket.labels.length > 0 && (
                    <div class='labels'>
                        {ticket.labels.map((label) => {
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
                                    <Icon name='close' onClick={() => handleRemoveLabel(label)} size='c' type='info' />
                                </span>
                            )
                        })}
                    </div>
                )}
            </div>

            <div class='content'>
                <div class='labels-section'>
                    <h2>Labels</h2>
                    <div class='labels-fields'>
                        <div class='labels-list'>
                            {labelsState.labels.map((label) => {
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
                                        <Icon name='close' onClick={() => handleRemoveLabel(label)} size='c' type='info' />
                                    </span>
                                )
                            })}
                        </div>
                        <div class='add-label'>
                            <div class='label-input-wrapper'>
                                <FieldText
                                    model={labelsState.$newLabel}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAddLabel()
                                        }
                                    }}
                                    placeholder='Type to search or add new label'
                                />
                                {labelsState.newLabel.trim() && getLabelSuggestions().length > 0 && (
                                    <div class='label-suggestions'>
                                        {getLabelSuggestions()
                                            .slice(0, 5)
                                            .map((def) => (
                                                <button
                                                    class='suggestion-item'
                                                    key={def.id}
                                                    onClick={() => handleAddLabel(def.name)}
                                                    type='button'
                                                >
                                                    <span
                                                        class='suggestion-badge'
                                                        style={{
                                                            backgroundColor: def.color,
                                                            borderColor: def.color,
                                                        }}
                                                    >
                                                        {def.name}
                                                    </span>
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                            <Button onClick={() => handleAddLabel()} type='default'>
                                Add
                            </Button>
                        </div>
                    </div>
                </div>

                <div class='assignee-section'>
                    <h2>Assignees</h2>
                    <div class='assignees-list'>
                        {(ticket.assignees || []).map((assignee) => {
                            if (assignee.assignee_type === 'agent') {
                                const agent = $s.agents.find(
                                    (a) => a.id === assignee.assignee_id || a.name === assignee.assignee_id,
                                )
                                return agent ? (
                                    <div class='assignee-item' key={`${assignee.assignee_type}-${assignee.assignee_id}`}>
                                        <AgentBadge
                                            agent={{
                                                avatar: agent.avatar || 'placeholder-1.png',
                                                displayName: agent.display_name || agent.name,
                                                id: agent.id,
                                                name: agent.name,
                                                status: (agent.status || 'idle') as 'idle' | 'working' | 'error' | 'offline',
                                                type: ((agent.type as string | undefined) === 'prioritizer'
                                                    ? 'planner'
                                                    : agent.type || 'developer') as 'developer' | 'planner' | 'reviewer',
                                            }}
                                            size='d'
                                        />
                                        <Icon
                                            name='close'
                                            onClick={() => handleRemoveAssignee(assignee.assignee_type, assignee.assignee_id)}
                                            size='c'
                                            type='info'
                                        />
                                    </div>
                                ) : (
                                    <div class='assignee-item' key={`${assignee.assignee_type}-${assignee.assignee_id}`}>
                                        <span>{assignee.assignee_id}</span>
                                        <Icon
                                            name='close'
                                            onClick={() => handleRemoveAssignee(assignee.assignee_type, assignee.assignee_id)}
                                            size='c'
                                            type='info'
                                        />
                                    </div>
                                )
                            }
                            return (
                                <div class='assignee-item' key={`${assignee.assignee_type}-${assignee.assignee_id}`}>
                                    <UserBadge userId={assignee.assignee_id} />
                                    <Icon
                                        name='close'
                                        onClick={() => handleRemoveAssignee(assignee.assignee_type, assignee.assignee_id)}
                                        size='c'
                                        type='info'
                                    />
                                </div>
                            )
                        })}
                    </div>
                    <div class='assignee-fields'>
                        <div class='add-assignee'>
                            <FieldSelect
                                label='Add Assignee Type'
                                model={assigneeState.$assignee_type}
                                onChange={() => {
                                    assigneeState.assignee_id = ''
                                }}
                                options={[
                                    {id: '', name: 'Select type'},
                                    {id: 'agent', name: 'Agent'},
                                    {id: 'human', name: 'Human'},
                                ]}
                                placeholder='Select assignee type'
                            />
                            {assigneeState.assignee_type && (
                                <>
                                    <FieldSelect
                                        label='Select Assignee'
                                        model={assigneeState.$assignee_id}
                                        options={getAssigneeOptions()}
                                        placeholder={
                                            getAssigneeOptions().length === 0 ? 'No available assignees' : 'Select assignee'
                                        }
                                    />
                                    {assigneeState.assignee_id && (
                                        <Button
                                            onClick={() => {
                                                if (assigneeState.assignee_id) {
                                                    handleAddAssignee(
                                                        assigneeState.assignee_type as 'agent' | 'human',
                                                        assigneeState.assignee_id,
                                                    )
                                                    assigneeState.assignee_id = ''
                                                    assigneeState.assignee_type = ''
                                                }
                                            }}
                                            type='default'
                                        >
                                            Add Assignee
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div class='description'>
                    <h2>Description</h2>
                    {isEditing ? (
                        <div class='edit-description'>
                            <FieldTextarea
                                onChange={(value) => {
                                    editState.description = value
                                }}
                                placeholder='Enter ticket description (markdown supported)'
                                value={editState.description}
                            />
                            <div class='edit-actions'>
                                <Button onClick={handleSaveEdit} type='success'>
                                    Save
                                </Button>
                                <Button onClick={handleCancelEdit} type='default'>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (ticket.description ? (
                        <div
                            class='description-content'
                            dangerouslySetInnerHTML={{
                                __html: renderMarkdown(ticket.description),
                            }}
                        />
                    ) : (
                        <p class='no-description'>No description provided</p>
                    ))}
                </div>

                {ticket.status === 'closed' && (
                    <div class='actions'>
                        <Button onClick={handleApprove} type='success'>
                            Approve & Close
                        </Button>
                        <Button onClick={handleReopen} type='default'>
                            Reopen
                        </Button>
                    </div>
                )}

                <div class='comments'>
                    <h2>Comments</h2>
                    {comments.length === 0 ? (
                        <p class='no-comments'>No comments yet</p>
                    ) : (
                        <div class='comments-list'>
                            {comments.map((comment) => {
                                const isGenerating = comment.status === 'generating'
                                const hasContent = comment.content && comment.content.trim().length > 0

                                return (
                                    <div class={`comment ${isGenerating ? 'comment--generating' : ''}`} key={comment.id}>
                                        <div class='comment-header'>
                                            {comment.author_type === 'agent' ? (
                                                (() => {
                                                    const agent = $s.agents.find(
                                                        (a) => a.id === comment.author_id || a.name === comment.author_id,
                                                    )
                                                    return agent ? (
                                                        <AgentBadge
                                                            agent={{
                                                                avatar: agent.avatar || 'placeholder-1.png',
                                                                displayName: agent.display_name || agent.name,
                                                                id: agent.id,
                                                                name: agent.name,
                                                                status: (agent.status || 'idle') as
                                                                    | 'idle'
                                                                    | 'working'
                                                                    | 'error'
                                                                    | 'offline',
                                                                type: ((agent.type as string | undefined) === 'prioritizer'
                                                                    ? 'planner'
                                                                    : agent.type || 'developer') as
                                                                    | 'developer'
                                                                    | 'planner'
                                                                    | 'reviewer',
                                                            }}
                                                            size='d'
                                                        />
                                                    ) : (
                                                        <UserBadge displayName={comment.author_id} userId={comment.author_id} />
                                                    )
                                                })()
                                            ) : (
                                                <UserBadge
                                                    avatar={
                                                        comment.author_id === $s.profile.username ? $s.profile.avatar : undefined
                                                    }
                                                    displayName={
                                                        comment.author_id === $s.profile.username
                                                            ? $s.profile.displayName
                                                            : comment.author_id
                                                    }
                                                    userId={comment.author_id}
                                                />
                                            )}
                                            <span class='comment-time'>{new Date(comment.created_at).toLocaleString()}</span>
                                            {isGenerating && (
                                                <span class='comment-status'>
                                                    <Icon name='more_horiz' size='d' />
                                                    <span>Agent is thinking...</span>
                                                </span>
                                            )}
                                        </div>
                                        {hasContent ? (
                                            <div
                                                class='comment-content'
                                                dangerouslySetInnerHTML={{
                                                    __html: renderMarkdown(comment.content),
                                                }}
                                            />
                                        ) : (isGenerating ? (
                                            <div class='comment-content comment-content--placeholder'>
                                                <span class='typing-indicator'>
                                                    <span />
                                                    <span />
                                                    <span />
                                                </span>
                                            </div>
                                        ) : null)}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <div class='add-comment'>
                        <div class='comment-input-wrapper'>
                            <textarea
                                class='comment-input'
                                onInput={(e) => {
                                    commentState.content = (e.target as HTMLTextAreaElement).value
                                }}
                                placeholder='Type your comment... Use @ to mention agents or users'
                                ref={commentTextareaRef}
                                rows={4}
                                value={commentState.content}
                            />
                            <MentionAutocomplete
                                content={commentState.content}
                                onContentChange={(newContent) => {
                                    commentState.content = newContent
                                }}
                                textareaRef={commentTextareaRef}
                            />
                        </div>
                        <Button disabled={!commentState.content.trim()} onClick={handleAddComment}>
                            Add Comment
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
