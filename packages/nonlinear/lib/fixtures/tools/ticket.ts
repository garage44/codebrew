/**
 * Ticket operation tools for querying and updating tickets
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {db} from '../../database.ts'
import {updateTicketFields} from '../../agent/ticket-updates.ts'

export const ticketTools: Record<string, Tool> = {
    get_ticket: {
        name: 'get_ticket',
        description: 'Get a single ticket by ID with full details',
        parameters: [
            {
                name: 'ticketId',
                type: 'string',
                description: 'Ticket ID',
                required: true,
            },
        ],
        execute: async (params: {ticketId: string}, context: ToolContext): Promise<ToolResult> => {
            try {
                const ticket = db.prepare(`
                    SELECT t.*, r.name as repository_name, r.path as repository_path
                    FROM tickets t
                    LEFT JOIN repositories r ON t.repository_id = r.id
                    WHERE t.id = ?
                `).get(params.ticketId) as {
                    id: string
                    repository_id: string
                    title: string
                    description: string | null
                    status: string
                    priority: number | null
                    assignee_type: string | null
                    assignee_id: string | null
                    branch_name: string | null
                    merge_request_id: string | null
                    created_at: number
                    updated_at: number
                    repository_name: string | null
                    repository_path: string | null
                } | undefined

                if (!ticket) {
                    return {
                        success: false,
                        error: `Ticket not found: ${params.ticketId}`,
                    }
                }

                // Get labels
                const labels = db.prepare(`
                    SELECT label FROM ticket_labels WHERE ticket_id = ?
                `).all(params.ticketId) as Array<{label: string}>

                // Get assignees
                const assignees = db.prepare(`
                    SELECT assignee_type, assignee_id FROM ticket_assignees WHERE ticket_id = ?
                `).all(params.ticketId) as Array<{assignee_type: string; assignee_id: string}>

                return {
                    success: true,
                    data: {
                        ...ticket,
                        labels: labels.map(l => l.label),
                        assignees: assignees.map(a => ({
                            type: a.assignee_type,
                            id: a.assignee_id,
                        })),
                    },
                }
            } catch (error) {
                logger.error(`[TicketTool] Failed to get ticket ${params.ticketId}:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    list_tickets: {
        name: 'list_tickets',
        description: 'List tickets with optional filters (status, assignee, repository). All filters are optional - if not specified, returns all tickets. Supports both inclusion (assigned to X) and exclusion (not assigned to X) filters. Use assigneeId="me" to filter by current agent.',
        parameters: [
            {
                name: 'status',
                type: 'string',
                description: 'Filter by status (e.g., "todo", "in_progress", "review", "closed", "backlog")',
                required: false,
            },
            {
                name: 'assigneeType',
                type: 'string',
                description: 'Filter by assignee type (e.g., "agent", "user"). Use with assigneeId to include tickets assigned to this assignee.',
                required: false,
            },
            {
                name: 'assigneeId',
                type: 'string',
                description: 'Filter by assignee ID (e.g., agent name or user ID). Use "me" to refer to the current agent. Use with assigneeType to include tickets assigned to this assignee.',
                required: false,
            },
            {
                name: 'excludeAssigneeType',
                type: 'string',
                description: 'Exclude tickets assigned to this assignee type (e.g., "agent", "user"). Use with excludeAssigneeId to exclude tickets assigned to a specific assignee.',
                required: false,
            },
            {
                name: 'excludeAssigneeId',
                type: 'string',
                description: 'Exclude tickets assigned to this assignee ID. Use "me" to exclude tickets assigned to the current agent. Use with excludeAssigneeType.',
                required: false,
            },
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Filter by repository ID',
                required: false,
            },
            {
                name: 'limit',
                type: 'number',
                description: 'Maximum number of tickets to return (default: 50)',
                required: false,
            },
        ],
        execute: async (params: {
            status?: string
            assigneeType?: string
            assigneeId?: string
            excludeAssigneeType?: string
            excludeAssigneeId?: string
            repositoryId?: string
            limit?: number
        }, context: ToolContext): Promise<ToolResult> => {
            // Only resolve "me" if explicitly provided - don't auto-filter by agent
            let assigneeId = params.assigneeId
            let assigneeType = params.assigneeType

            // Resolve "me" keyword to agent name if explicitly provided
            if (assigneeId === 'me' && context.agent) {
                assigneeId = context.agent.name
                assigneeType = assigneeType || 'agent'
            }

            // Handle excludeAssigneeId "me"
            let excludeAssigneeId = params.excludeAssigneeId
            let excludeAssigneeType = params.excludeAssigneeType

            if (excludeAssigneeId === 'me' && context.agent) {
                excludeAssigneeId = context.agent.name
                excludeAssigneeType = excludeAssigneeType || 'agent'
            }

            try {
                const limit = params.limit || 50

                let query = `
                    SELECT DISTINCT t.*, r.name as repository_name
                    FROM tickets t
                    LEFT JOIN repositories r ON t.repository_id = r.id
                `
                const conditions: string[] = []
                const values: unknown[] = []

                if (params.status) {
                    conditions.push('t.status = ?')
                    values.push(params.status)
                }

                if (params.repositoryId) {
                    conditions.push('t.repository_id = ?')
                    values.push(params.repositoryId)
                }

                // Handle inclusion filter (assigned TO someone)
                if (assigneeType || assigneeId) {
                    query += ' JOIN ticket_assignees ta ON t.id = ta.ticket_id'
                    if (assigneeType) {
                        conditions.push('ta.assignee_type = ?')
                        values.push(assigneeType)
                    }
                    if (assigneeId) {
                        conditions.push('ta.assignee_id = ?')
                        values.push(assigneeId)
                    }
                }

                // Handle exclusion filter (NOT assigned to someone)
                // Use a subquery to exclude tickets that have the specified assignee
                if (excludeAssigneeType || excludeAssigneeId) {
                    const excludeConditions: string[] = []
                    const excludeValues: unknown[] = []

                    if (excludeAssigneeType) {
                        excludeConditions.push('ta_exclude.assignee_type = ?')
                        excludeValues.push(excludeAssigneeType)
                    }
                    if (excludeAssigneeId) {
                        excludeConditions.push('ta_exclude.assignee_id = ?')
                        excludeValues.push(excludeAssigneeId)
                    }

                    // Use NOT EXISTS to exclude tickets with the specified assignee
                    conditions.push(`NOT EXISTS (
                        SELECT 1 FROM ticket_assignees ta_exclude
                        WHERE ta_exclude.ticket_id = t.id
                        ${excludeConditions.length > 0 ? `AND ${excludeConditions.join(' AND ')}` : ''}
                    )`)
                    values.push(...excludeValues)
                }

                if (conditions.length > 0) {
                    query += ` WHERE ${conditions.join(' AND ')}`
                }

                query += ` ORDER BY t.priority DESC, t.created_at DESC LIMIT ?`
                values.push(limit)

                const tickets = db.prepare(query).all(...values) as Array<{
                    id: string
                    repository_id: string
                    title: string
                    description: string | null
                    status: string
                    priority: number | null
                    assignee_type: string | null
                    assignee_id: string | null
                    branch_name: string | null
                    merge_request_id: string | null
                    created_at: number
                    updated_at: number
                    repository_name: string | null
                }>

                // Enrich with labels and assignees
                const enriched = await Promise.all(
                    tickets.map(async (ticket) => {
                        const labels = db.prepare(`
                            SELECT label FROM ticket_labels WHERE ticket_id = ?
                        `).all(ticket.id) as Array<{label: string}>

                        const assignees = db.prepare(`
                            SELECT assignee_type, assignee_id FROM ticket_assignees WHERE ticket_id = ?
                        `).all(ticket.id) as Array<{assignee_type: string; assignee_id: string}>

                        return {
                            ...ticket,
                            labels: labels.map(l => l.label),
                            assignees: assignees.map(a => ({
                                type: a.assignee_type,
                                id: a.assignee_id,
                            })),
                        }
                    })
                )

                return {
                    success: true,
                    data: enriched,
                    context: {
                        total: enriched.length,
                        filters: {
                            status: params.status,
                            repositoryId: params.repositoryId,
                            limit: params.limit,
                            // Only include assignee filters if they were actually applied
                            ...(assigneeType || assigneeId ? {assigneeType, assigneeId} : {}),
                            ...(excludeAssigneeType || excludeAssigneeId ? {excludeAssigneeType, excludeAssigneeId} : {}),
                        },
                    },
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to list tickets:', error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    update_ticket: {
        name: 'update_ticket',
        description: 'Update ticket fields (title, description, status, priority, solution_plan). Only include fields you want to update. All fields are optional.',
        parameters: [
            {
                name: 'ticketId',
                type: 'string',
                description: 'Ticket ID',
                required: true,
            },
            {
                name: 'title',
                type: 'string',
                description: 'Ticket title',
                required: false,
            },
            {
                name: 'description',
                type: 'string',
                description: 'Ticket description (use markdown formatting, code blocks, Mermaid diagrams for architecture)',
                required: false,
            },
            {
                name: 'status',
                type: 'string',
                description: 'Ticket status (e.g., "todo", "in_progress", "review", "closed", "backlog")',
                required: false,
            },
            {
                name: 'priority',
                type: 'number',
                description: 'Ticket priority (0-10, where 10 is highest priority)',
                required: false,
            },
            {
                name: 'solution_plan',
                type: 'string',
                description: 'Solution plan for implementing the ticket (used by Developer agent)',
                required: false,
            },
        ],
        execute: async (params: {
            ticketId: string
            title?: string | null
            description?: string | null
            status?: string | null
            priority?: number | null
            solution_plan?: string | null
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const agentType = context.agent?.getType()
                const result = await updateTicketFields(
                    params.ticketId,
                    {
                        title: params.title,
                        description: params.description,
                        status: params.status,
                        priority: params.priority,
                        solution_plan: params.solution_plan,
                    },
                    agentType,
                )

                if (!result.success) {
                    return {
                        success: false,
                        error: result.error || 'Failed to update ticket',
                    }
                }

                // Get updated ticket to return
                const ticket = db.prepare(`
                    SELECT t.*, r.name as repository_name
                    FROM tickets t
                    LEFT JOIN repositories r ON t.repository_id = r.id
                    WHERE t.id = ?
                `).get(params.ticketId) as {
                    id: string
                    title: string
                    description: string | null
                    status: string
                    priority: number | null
                    solution_plan: string | null
                } | undefined

                return {
                    success: true,
                    data: {
                        ticketId: params.ticketId,
                        ticket: ticket || null,
                        updatedFields: Object.keys(params).filter(key => key !== 'ticketId' && params[key as keyof typeof params] !== undefined),
                    },
                }
            } catch (error) {
                logger.error(`[TicketTool] Failed to update ticket:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    update_ticket_status: {
        name: 'update_ticket_status',
        description: 'Update ticket status (e.g., "todo", "in_progress", "review", "closed", "backlog"). Deprecated: Use update_ticket instead.',
        parameters: [
            {
                name: 'ticketId',
                type: 'string',
                description: 'Ticket ID',
                required: true,
            },
            {
                name: 'status',
                type: 'string',
                description: 'New status',
                required: true,
            },
        ],
        execute: async (params: {ticketId: string; status: string}, context: ToolContext): Promise<ToolResult> => {
            try {
                const agentType = context.agent?.getType()
                const result = await updateTicketFields(
                    params.ticketId,
                    {status: params.status},
                    agentType,
                )

                if (!result.success) {
                    return {
                        success: false,
                        error: result.error || 'Failed to update ticket status',
                    }
                }

                return {
                    success: true,
                    data: {
                        ticketId: params.ticketId,
                        status: params.status,
                    },
                }
            } catch (error) {
                logger.error(`[TicketTool] Failed to update ticket status:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    update_ticket_priority: {
        name: 'update_ticket_priority',
        description: 'Update ticket priority (0-10, where 10 is highest priority). Deprecated: Use update_ticket instead.',
        parameters: [
            {
                name: 'ticketId',
                type: 'string',
                description: 'Ticket ID',
                required: true,
            },
            {
                name: 'priority',
                type: 'number',
                description: 'Priority value (0-10, where 10 is highest)',
                required: true,
            },
        ],
        execute: async (params: {ticketId: string; priority: number}, context: ToolContext): Promise<ToolResult> => {
            try {
                const agentType = context.agent?.getType()
                const result = await updateTicketFields(
                    params.ticketId,
                    {priority: params.priority},
                    agentType,
                )

                if (!result.success) {
                    return {
                        success: false,
                        error: result.error || 'Failed to update ticket priority',
                    }
                }

                return {
                    success: true,
                    data: {
                        ticketId: params.ticketId,
                        priority: params.priority,
                    },
                }
            } catch (error) {
                logger.error(`[TicketTool] Failed to update ticket priority:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    add_ticket_comment: {
        name: 'add_ticket_comment',
        description: 'Add a comment to a ticket (useful for refining tickets, adding details, or breaking down tasks)',
        parameters: [
            {
                name: 'ticketId',
                type: 'string',
                description: 'Ticket ID',
                required: true,
            },
            {
                name: 'content',
                type: 'string',
                description: 'Comment content',
                required: true,
            },
            {
                name: 'authorType',
                type: 'string',
                description: 'Author type (e.g., "agent", "user")',
                required: false,
            },
            {
                name: 'authorId',
                type: 'string',
                description: 'Author ID (defaults to agent name if not provided)',
                required: false,
            },
        ],
        execute: async (params: {
            ticketId: string
            content: string
            authorType?: string
            authorId?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                // Verify ticket exists
                const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(params.ticketId)
                if (!ticket) {
                    return {
                        success: false,
                        error: `Ticket not found: ${params.ticketId}`,
                    }
                }

                const authorType = params.authorType || (context.agent ? 'agent' : 'user')
                const authorId = params.authorId || (context.agent ? context.agent.name : 'system')
                const commentId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

                db.prepare(`
                    INSERT INTO comments (id, ticket_id, content, author_type, author_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(commentId, params.ticketId, params.content, authorType, authorId, Date.now())

                // Update ticket updated_at timestamp
                db.prepare(`
                    UPDATE tickets
                    SET updated_at = ?
                    WHERE id = ?
                `).run(Date.now(), params.ticketId)

                return {
                    success: true,
                    data: {
                        commentId,
                        ticketId: params.ticketId,
                        content: params.content,
                        authorType,
                        authorId,
                    },
                }
            } catch (error) {
                logger.error(`[TicketTool] Failed to add ticket comment:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    get_ticket_statistics: {
        name: 'get_ticket_statistics',
        description: 'Get ticket statistics and counts by status, priority, assignee, etc.',
        parameters: [
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Filter by repository ID (optional)',
                required: false,
            },
        ],
        execute: async (params: {repositoryId?: string}, context: ToolContext): Promise<ToolResult> => {
            try {
                const conditions: string[] = []
                const values: unknown[] = []

                if (params.repositoryId) {
                    conditions.push('repository_id = ?')
                    values.push(params.repositoryId)
                }

                const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

                // Get counts by status
                const statusCounts = db.prepare(`
                    SELECT status, COUNT(*) as count
                    FROM tickets
                    ${whereClause}
                    GROUP BY status
                `).all(...values) as Array<{status: string; count: number}>

                // Get counts by priority range
                const priorityCounts = db.prepare(`
                    SELECT
                        CASE
                            WHEN priority >= 8 THEN 'high'
                            WHEN priority >= 5 THEN 'medium'
                            WHEN priority >= 1 THEN 'low'
                            ELSE 'unprioritized'
                        END as priority_level,
                        COUNT(*) as count
                    FROM tickets
                    ${whereClause}
                    GROUP BY priority_level
                `).all(...values) as Array<{priority_level: string; count: number}>

                // Get total count
                const totalResult = db.prepare(`
                    SELECT COUNT(*) as total
                    FROM tickets
                    ${whereClause}
                `).get(...values) as {total: number}

                // Get tickets by assignee type
                const assigneeCounts = db.prepare(`
                    SELECT ta.assignee_type, COUNT(DISTINCT t.id) as count
                    FROM tickets t
                    LEFT JOIN ticket_assignees ta ON t.id = ta.ticket_id
                    ${whereClause}
                    GROUP BY ta.assignee_type
                `).all(...values) as Array<{assignee_type: string | null; count: number}>

                return {
                    success: true,
                    data: {
                        total: totalResult.total,
                        byStatus: statusCounts.reduce((acc, row) => {
                            acc[row.status] = row.count
                            return acc
                        }, {} as Record<string, number>),
                        byPriority: priorityCounts.reduce((acc, row) => {
                            acc[row.priority_level] = row.count
                            return acc
                        }, {} as Record<string, number>),
                        byAssigneeType: assigneeCounts.reduce((acc, row) => {
                            acc[row.assignee_type || 'unassigned'] = row.count
                            return acc
                        }, {} as Record<string, number>),
                    },
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to get ticket statistics:', error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
