import {ws} from '@garage44/common/app'
import {Button} from '@garage44/common/components'
import {deepSignal} from 'deepsignal'
import {useEffect} from 'preact/hooks'

import type {TicketCardProps} from '@/components/elements/ticket/ticket'

import {$s} from '@/app'
import {TicketCard} from '@/components/elements/ticket/ticket'

const LANES = [
    {id: 'backlog', label: 'Backlog'},
    {id: 'todo', label: 'Todo'},
    {id: 'in_progress', label: 'In Progress'},
    {id: 'review', label: 'Review'},
    {id: 'closed', label: 'Closed'},
] as const

// Local state for drag and drop
const dragState = deepSignal({
    draggingTicketId: null as string | null,
    dropPosition: null as 'above' | 'below' | null,
    dropTargetTicketId: null as string | null,
})

const handleDragStart = (e: DragEvent, ticketId: string) => {
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', ticketId)
    }
    dragState.draggingTicketId = ticketId
    const target = e.currentTarget as HTMLElement
    if (target) {
        target.classList.add('dragging')
    }
}

const handleDragEnd = (e: DragEvent) => {
    dragState.draggingTicketId = null
    dragState.dropTargetTicketId = null
    dragState.dropPosition = null
    const target = e.currentTarget as HTMLElement
    if (target) {
        target.classList.remove('dragging')
    }
    // Remove all drop indicators
    document.querySelectorAll('.drop-indicator').forEach((el) => {
        el.remove()
    })
}

const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move'
    }
    // Add visual feedback for drag over
    const target = e.currentTarget as HTMLElement
    if (target) {
        target.classList.add('drag-over')
    }
}

const handleDragLeave = (e: DragEvent) => {
    const target = e.currentTarget as HTMLElement
    if (target) {
        target.classList.remove('drag-over')
    }
}

const handleTicketDragOver = (e: DragEvent, ticketId: string, _ticketIndex: number, _tickets: typeof $s.tickets) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move'
    }

    if (!dragState.draggingTicketId || dragState.draggingTicketId === ticketId) {
        dragState.dropTargetTicketId = null
        dragState.dropPosition = null
        return
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mouseY = e.clientY
    const ticketCenter = rect.top + rect.height / 2
    const dropPosition = mouseY < ticketCenter ? 'above' : 'below'

    dragState.dropTargetTicketId = ticketId
    dragState.dropPosition = dropPosition

    // Remove existing drop indicators
    document.querySelectorAll('.drop-indicator').forEach((el) => {
        el.remove()
    })

    // Create drop indicator
    const indicator = document.createElement('div')
    indicator.className = 'drop-indicator'
    const targetElement = e.currentTarget as HTMLElement
    const parent = targetElement.parentElement
    if (parent) {
        if (dropPosition === 'above') {
            parent.insertBefore(indicator, targetElement)
        } else {
            const nextSibling = targetElement.nextSibling
            if (nextSibling) {
                parent.insertBefore(indicator, nextSibling)
            } else {
                parent.append(indicator)
            }
        }
    }
}

const handleTicketDragLeave = (e: DragEvent) => {
    // Only remove indicator if we're actually leaving the ticket area
    const relatedTarget = e.relatedTarget as HTMLElement | null
    if (relatedTarget && !relatedTarget.closest('.ticket-card-container')) {
        dragState.dropTargetTicketId = null
        dragState.dropPosition = null
        document.querySelectorAll('.drop-indicator').forEach((el) => {
            el.remove()
        })
    }
}

export const Board = () => {
    useEffect(() => {
        // Load tickets on mount
        (async() => {
            const result = (await ws.get('/api/tickets')) as {tickets?: unknown}
            if (result.tickets) {
                $s.tickets = result.tickets as typeof $s.tickets
            }
        })()
    }, [])

    const handleAddTicket = (laneId: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed') => {
        $s.selectedLane = laneId
        if ($s.panels.context.collapsed) {
            $s.panels.context.collapsed = false
        }
    }

    const getTicketsForLane = (status: string) => {
        const laneTickets = $s.tickets.filter((ticket) => ticket.status === status)
        // Sort by priority: higher priority first, null priorities at the end
        return [...laneTickets].toSorted((a, b) => {
            // Handle null priorities - put them at the end
            if (a.priority === null && b.priority === null) return 0
            if (a.priority === null) return 1
            if (b.priority === null) return -1
            // Higher priority first (descending order)
            return b.priority - a.priority
        })
    }

    const calculateNewPriority = (
        draggedTicketId: string,
        targetTicketId: string,
        targetStatus: string,
        dropPosition: 'above' | 'below',
    ): number => {
        const laneTickets = getTicketsForLane(targetStatus).filter((t) => t.id !== draggedTicketId)
        const targetIndex = laneTickets.findIndex((t) => t.id === targetTicketId)
        const draggedTicket = $s.tickets.find((t) => t.id === draggedTicketId)

        if (targetIndex === -1 || !draggedTicket) return draggedTicket?.priority ?? 5

        const targetTicket = laneTickets[targetIndex]
        const targetPriority = targetTicket.priority ?? 0

        /*
         * If dropping above, we want priority higher than target
         * If dropping below, we want priority lower than target
         */
        if (dropPosition === 'above') {
            // Check if there's a ticket above the target
            if (targetIndex > 0) {
                const ticketAbove = laneTickets[targetIndex - 1]
                const abovePriority = ticketAbove.priority ?? 0
                // Set priority between above and target (closer to target)
                const midPriority = Math.floor((abovePriority + targetPriority) / 2)
                const newPriority = midPriority > abovePriority ? midPriority : targetPriority + 1
                // Constrain to valid range (0-10)
                return Math.min(10, Math.max(0, newPriority))
            }
            // Dropping at the top - set priority higher than target
            return Math.min(10, targetPriority + 1)
        }
        // Dropping below
        if (targetIndex < laneTickets.length - 1) {
            const ticketBelow = laneTickets[targetIndex + 1]
            const belowPriority = ticketBelow.priority ?? 0
            // Set priority between target and below (closer to target)
            const midPriority = Math.floor((targetPriority + belowPriority) / 2)
            const newPriority = midPriority < targetPriority ? midPriority : Math.max(0, targetPriority - 1)
            // Constrain to valid range (0-10)
            return Math.min(10, Math.max(0, newPriority))
        }
        // Dropping at the bottom - set priority lower than target
        return Math.max(0, targetPriority - 1)
    }

    const handleTicketDrop = async(e: DragEvent, targetTicketId: string, targetStatus: string) => {
        e.preventDefault()
        e.stopPropagation()

        const ticketId = e.dataTransfer?.getData('text/plain')
        if (!ticketId || ticketId === targetTicketId) {
            dragState.dropTargetTicketId = null
            dragState.dropPosition = null
            document.querySelectorAll('.drop-indicator').forEach((el) => {
                el.remove()
            })
            return
        }

        const draggedTicket = $s.tickets.find((t) => t.id === ticketId)
        if (!draggedTicket) return

        const isSameLane = draggedTicket.status === targetStatus
        const dropPosition = dragState.dropPosition ?? 'below'

        try {
            const updates: {priority?: number; status?: string} = {}

            if (!isSameLane) {
                // Moving to different lane - update status
                updates.status = targetStatus
                // Set priority based on position in new lane
                const newPriority = calculateNewPriority(ticketId, targetTicketId, targetStatus, dropPosition)
                updates.priority = newPriority
            } else {
                // Reordering within same lane - only update priority
                const newPriority = calculateNewPriority(ticketId, targetTicketId, targetStatus, dropPosition)
                updates.priority = newPriority
            }

            // Optimistic update
            const ticketIndex = $s.tickets.findIndex((t) => t.id === ticketId)
            if (ticketIndex >= 0) {
                const updatedTickets = [...$s.tickets] as typeof $s.tickets
                updatedTickets[ticketIndex] = {
                    ...updatedTickets[ticketIndex],
                    ...updates,
                } as (typeof $s.tickets)[number]
                $s.tickets = updatedTickets
            }

            // Update via API
            await ws.put(`/api/tickets/${ticketId}`, updates)

            // Clean up drag state
            dragState.dropTargetTicketId = null
            dragState.dropPosition = null
            document.querySelectorAll('.drop-indicator').forEach((el) => {
                el.remove()
            })
        } catch(error) {
            // Revert optimistic update on error
            const result = (await ws.get('/api/tickets')) as {tickets?: unknown}
            if (result.tickets) {
                $s.tickets = result.tickets as typeof $s.tickets
            }
            console.error('Failed to update ticket:', error)
            dragState.dropTargetTicketId = null
            dragState.dropPosition = null
            document.querySelectorAll('.drop-indicator').forEach((el) => {
                el.remove()
            })
        }
    }

    const handleDrop = async(e: DragEvent, targetStatus: string) => {
        e.preventDefault()
        const target = e.currentTarget as HTMLElement
        if (target) {
            target.classList.remove('drag-over')
        }

        // If dropping on a ticket, that handler will take care of it
        if (dragState.dropTargetTicketId) {
            return
        }

        const ticketId = e.dataTransfer?.getData('text/plain')
        if (!ticketId) return

        const draggedTicket = $s.tickets.find((t) => t.id === ticketId)
        if (!draggedTicket) return

        // Only handle lane drops if not dropping on a specific ticket
        if (draggedTicket.status === targetStatus) {
            // Same lane, but no specific ticket target - no change needed
            return
        }

        try {
            // Update ticket status optimistically for immediate UI feedback
            const ticketIndex = $s.tickets.findIndex((t) => t.id === ticketId)
            if (ticketIndex >= 0) {
                // Create new array for DeepSignal reactivity
                const updatedTickets = [...$s.tickets] as typeof $s.tickets
                updatedTickets[ticketIndex] = {
                    ...updatedTickets[ticketIndex],
                    status: targetStatus,
                } as (typeof $s.tickets)[number]
                $s.tickets = updatedTickets
            }

            // Update ticket status via API
            await ws.put(`/api/tickets/${ticketId}`, {
                status: targetStatus,
            })
            // WebSocket broadcast will update state with server response
        } catch(error) {
            // Revert optimistic update on error
            const result = (await ws.get('/api/tickets')) as {tickets?: unknown}
            if (result.tickets) {
                $s.tickets = result.tickets as typeof $s.tickets
            }
            console.error('Failed to update ticket status:', error)
        }
    }

    return (
        <div class='c-board'>
            <div class='header'>
                <h1>Development</h1>
            </div>
            <div class='lanes'>
                {LANES.map((lane) => {
                    const tickets = getTicketsForLane(lane.id)
                    return (
                        <div
                            class='lane'
                            data-lane={lane.id}
                            key={lane.id}
                            onDragLeave={handleDragLeave}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, lane.id)}
                        >
                            <div class='lane-header'>
                                <h2>{lane.label}</h2>
                                <div class='lane-header-right'>
                                    <span class='lane-count'>{tickets.length}</span>
                                    <Button
                                        icon='add'
                                        onClick={() => handleAddTicket(lane.id)}
                                        size='s'
                                        tip={`Add ticket to ${lane.label}`}
                                        type='info'
                                        variant='toggle'
                                    />
                                </div>
                            </div>
                            <div class='lane-content'>
                                {tickets.length === 0 ?
                                    <div class='lane-empty'>No tickets</div> :
                                        tickets.map((ticket, index) => <div
                                            class='ticket-card-container'
                                            draggable
                                            key={ticket.id}
                                            onDragEnd={handleDragEnd}
                                            onDragLeave={handleTicketDragLeave}
                                            onDragOver={(e) => handleTicketDragOver(e, ticket.id, index, tickets)}
                                            onDragStart={(e) => handleDragStart(e, ticket.id)}
                                            onDrop={(e) => handleTicketDrop(e, ticket.id, lane.id)}
                                        >
                                            <TicketCard ticket={ticket as TicketCardProps['ticket']} />
                                        </div>)}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
