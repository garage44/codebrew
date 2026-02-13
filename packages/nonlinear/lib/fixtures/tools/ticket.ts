/**
 * Ticket operation tools for querying and updating tickets
 */

import type {Tool, ToolContext, ToolResult} from './types.ts'

import {logger} from '../../../service.ts'
import {updateTicketFields} from '../../agent/ticket-updates.ts'
import {getDb} from '../../database.ts'

export const ticketTools: Record<string, Tool> = {
    add_ticket_comment: {
        description: 'Add a comment to a ticket (useful for refining tickets, adding details, or breaking down tasks)',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {
                authorId: authorIdParam,
                authorType: authorTypeParam,
                content,
                ticketId,
            } = params as {authorId?: string; authorType?: string; content: string; ticketId: string}
            try {
                // Verify ticket exists
                const ticket = getDb().prepare('SELECT id FROM tickets WHERE id = ?').get(ticketId)
                if (!ticket) {
                    return {
                        error: `Ticket not found: ${ticketId}`,
                        success: false,
                    }
                }

                const authorType = authorTypeParam || (context.agent ? 'agent' : 'user')
                const authorId = authorIdParam || (context.agent ? context.agent.getName() : 'system')
                const commentId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

                getDb()
                    .prepare(`
                    INSERT INTO comments (id, ticket_id, content, author_type, author_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `)
                    .run(commentId, ticketId, content, authorType, authorId, Date.now())

                // Update ticket updated_at timestamp
                getDb()
                    .prepare(`
                    UPDATE tickets
                    SET updated_at = ?
                    WHERE id = ?
                `)
                    .run(Date.now(), ticketId)

                return {
                    data: {
                        authorId,
                        authorType,
                        commentId,
                        content,
                        ticketId,
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to add ticket comment:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'add_ticket_comment',
        parameters: [
            {
                description: 'Ticket ID',
                name: 'ticketId',
                required: true,
                type: 'string',
            },
            {
                description: 'Comment content',
                name: 'content',
                required: true,
                type: 'string',
            },
            {
                description: 'Author type (e.g., "agent", "user")',
                name: 'authorType',
                required: false,
                type: 'string',
            },
            {
                description: 'Author ID (defaults to agent name if not provided)',
                name: 'authorId',
                required: false,
                type: 'string',
            },
        ],
    },

    get_ticket: {
        description: 'Get a single ticket by ID with full details',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {ticketId} = params as {ticketId: string}
            try {
                const ticket = getDb()
                    .prepare(`
                    SELECT t.*, r.name as repository_name, r.path as repository_path
                    FROM tickets t
                    LEFT JOIN repositories r ON t.repository_id = r.id
                    WHERE t.id = ?
                `)
                    .get(ticketId) as
                    | {
                          assignee_id: string | null
                          assignee_type: string | null
                          branch_name: string | null
                          created_at: number
                          description: string | null
                          id: string
                          merge_request_id: string | null
                          priority: number | null
                          repository_id: string
                          repository_name: string | null
                          repository_path: string | null
                          status: string
                          title: string
                          updated_at: number
                      }
                    | undefined

                if (!ticket) {
                    return {
                        error: `Ticket not found: ${ticketId}`,
                        success: false,
                    }
                }

                // Get labels
                const labels = getDb()
                    .prepare(`
                    SELECT label FROM ticket_labels WHERE ticket_id = ?
                `)
                    .all(ticketId) as {label: string}[]

                // Get assignees
                const assignees = getDb()
                    .prepare(`
                    SELECT assignee_type, assignee_id FROM ticket_assignees WHERE ticket_id = ?
                `)
                    .all(ticketId) as {assignee_id: string; assignee_type: string}[]

                return {
                    data: {
                        ...ticket,
                        assignees: assignees.map((a) => ({
                            id: a.assignee_id,
                            type: a.assignee_type,
                        })),
                        labels: labels.map((l) => l.label),
                    },
                    success: true,
                }
            } catch (error) {
                logger.error(`[TicketTool] Failed to get ticket ${ticketId}:`, error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'get_ticket',
        parameters: [
            {
                description: 'Ticket ID',
                name: 'ticketId',
                required: true,
                type: 'string',
            },
        ],
    },

    get_ticket_statistics: {
        description: 'Get ticket statistics and counts by status, priority, assignee, etc.',
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
                const statusCounts = getDb()
                    .prepare(`
                    SELECT status, COUNT(*) as count
                    FROM tickets
                    ${whereClause}
                    GROUP BY status
                `)
                    .all(...(values as any)) as {count: number; status: string}[]

                // Get counts by priority range
                const priorityCounts = getDb()
                    .prepare(`
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
                `)
                    .all(...(values as any)) as {count: number; priority_level: string}[]

                // Get total count
                const totalResult = getDb()
                    .prepare(`
                    SELECT COUNT(*) as total
                    FROM tickets
                    ${whereClause}
                `)
                    .get(...(values as any)) as {total: number}

                // Get tickets by assignee type
                const assigneeCounts = getDb()
                    .prepare(`
                    SELECT ta.assignee_type, COUNT(DISTINCT t.id) as count
                    FROM tickets t
                    LEFT JOIN ticket_assignees ta ON t.id = ta.ticket_id
                    ${whereClause}
                    GROUP BY ta.assignee_type
                `)
                    .all(...(values as any)) as {assignee_type: string | null; count: number}[]

                return {
                    data: {
                        byAssigneeType: assigneeCounts.reduce(
                            (acc, row) => {
                                acc[row.assignee_type || 'unassigned'] = row.count
                                return acc
                            },
                            {} as Record<string, number>,
                        ),
                        byPriority: priorityCounts.reduce(
                            (acc, row) => {
                                acc[row.priority_level] = row.count
                                return acc
                            },
                            {} as Record<string, number>,
                        ),
                        byStatus: statusCounts.reduce(
                            (acc, row) => {
                                acc[row.status] = row.count
                                return acc
                            },
                            {} as Record<string, number>,
                        ),
                        total: totalResult.total,
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to get ticket statistics:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'get_ticket_statistics',
        parameters: [
            {
                description: 'Filter by repository ID (optional)',
                name: 'repositoryId',
                required: false,
                type: 'string',
            },
        ],
    },

    list_tickets: {
        description:
            'List tickets with optional filters (status, assignee, repository). All filters are optional - if not specified, returns all tickets. Supports both inclusion (assigned to X) and exclusion (not assigned to X) filters. Use assigneeId="me" to filter by current agent.',
        execute: async (
            params: {
                assigneeId?: string
                assigneeType?: string
                excludeAssigneeId?: string
                excludeAssigneeType?: string
                limit?: number
                repositoryId?: string
                status?: string
            },
            context: ToolContext,
        ): Promise<ToolResult> => {
            // Only resolve "me" if explicitly provided - don't auto-filter by agent
            let {assigneeId} = params
            let {assigneeType} = params

            // Resolve "me" keyword to agent name if explicitly provided
            if (assigneeId === 'me' && context.agent) {
                assigneeId = context.agent.getName()
                assigneeType = assigneeType || 'agent'
            }

            // Handle excludeAssigneeId "me"
            let {excludeAssigneeId} = params
            let {excludeAssigneeType} = params

            if (excludeAssigneeId === 'me' && context.agent) {
                excludeAssigneeId = context.agent.getName()
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

                /*
                 * Handle exclusion filter (NOT assigned to someone)
                 * Use a subquery to exclude tickets that have the specified assignee
                 */
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

                query += ' ORDER BY t.priority DESC, t.created_at DESC LIMIT ?'
                values.push(limit)

                const tickets = getDb()
                    .prepare(query)
                    .all(...(values as any)) as {
                    assignee_id: string | null
                    assignee_type: string | null
                    branch_name: string | null
                    created_at: number
                    description: string | null
                    id: string
                    merge_request_id: string | null
                    priority: number | null
                    repository_id: string
                    repository_name: string | null
                    status: string
                    title: string
                    updated_at: number
                }[]

                // Enrich with labels and assignees
                const enriched = await Promise.all(
                    tickets.map(async (ticket) => {
                        const labels = getDb()
                            .prepare(`
                            SELECT label FROM ticket_labels WHERE ticket_id = ?
                        `)
                            .all(ticket.id) as {label: string}[]

                        const assignees = getDb()
                            .prepare(`
                            SELECT assignee_type, assignee_id FROM ticket_assignees WHERE ticket_id = ?
                        `)
                            .all(ticket.id) as {assignee_id: string; assignee_type: string}[]

                        return {
                            ...ticket,
                            assignees: assignees.map((a) => ({
                                id: a.assignee_id,
                                type: a.assignee_type,
                            })),
                            labels: labels.map((l) => l.label),
                        }
                    }),
                )

                return {
                    context: {
                        filters: {
                            limit: params.limit,
                            repositoryId: params.repositoryId,
                            status: params.status,
                            // Only include assignee filters if they were actually applied
                            ...(assigneeType || assigneeId ? {assigneeId, assigneeType} : {}),
                            ...(excludeAssigneeType || excludeAssigneeId ? {excludeAssigneeId, excludeAssigneeType} : {}),
                        },
                        total: enriched.length,
                    },
                    data: enriched,
                    success: true,
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to list tickets:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'list_tickets',
        parameters: [
            {
                description: 'Filter by status (e.g., "todo", "in_progress", "review", "closed", "backlog")',
                name: 'status',
                required: false,
                type: 'string',
            },
            {
                description:
                    'Filter by assignee type (e.g., "agent", "user"). Use with assigneeId to include tickets assigned to this assignee.',
                name: 'assigneeType',
                required: false,
                type: 'string',
            },
            {
                description:
                    'Filter by assignee ID (e.g., agent name or user ID). Use "me" to refer to the current agent. Use with assigneeType to include tickets assigned to this assignee.',
                name: 'assigneeId',
                required: false,
                type: 'string',
            },
            {
                description:
                    'Exclude tickets assigned to this assignee type (e.g., "agent", "user"). Use with excludeAssigneeId to exclude tickets assigned to a specific assignee.',
                name: 'excludeAssigneeType',
                required: false,
                type: 'string',
            },
            {
                description:
                    'Exclude tickets assigned to this assignee ID. Use "me" to exclude tickets assigned to the current agent. Use with excludeAssigneeType.',
                name: 'excludeAssigneeId',
                required: false,
                type: 'string',
            },
            {
                description: 'Filter by repository ID',
                name: 'repositoryId',
                required: false,
                type: 'string',
            },
            {
                description: 'Maximum number of tickets to return (default: 50)',
                name: 'limit',
                required: false,
                type: 'number',
            },
        ],
    },

    update_ticket: {
        description:
            'Update ticket fields (title, description, status, priority, solution_plan). Only include fields you want to update. All fields are optional.',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {description, priority, solution_plan, status, ticketId, title} = params as {
                description?: string | null
                priority?: number | null
                solution_plan?: string | null
                status?: string | null
                ticketId: string
                title?: string | null
            }
            try {
                const agentType = context.agent?.getType()
                const result = await updateTicketFields(
                    ticketId,
                    {
                        description,
                        priority,
                        solution_plan,
                        status,
                        title,
                    },
                    agentType,
                )

                if (!result.success) {
                    return {
                        error: result.error || 'Failed to update ticket',
                        success: false,
                    }
                }

                // Get updated ticket to return
                const ticket = getDb()
                    .prepare(`
                    SELECT t.*, r.name as repository_name
                    FROM tickets t
                    LEFT JOIN repositories r ON t.repository_id = r.id
                    WHERE t.id = ?
                `)
                    .get(ticketId) as
                    | {
                          description: string | null
                          id: string
                          priority: number | null
                          solution_plan: string | null
                          status: string
                          title: string
                      }
                    | undefined

                return {
                    data: {
                        ticket: ticket || null,
                        ticketId,
                        updatedFields: Object.keys(params).filter(
                            (key) => key !== 'ticketId' && (params as Record<string, unknown>)[key] !== undefined,
                        ),
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to update ticket:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'update_ticket',
        parameters: [
            {
                description: 'Ticket ID',
                name: 'ticketId',
                required: true,
                type: 'string',
            },
            {
                description: 'Ticket title',
                name: 'title',
                required: false,
                type: 'string',
            },
            {
                description: 'Ticket description (use markdown formatting, code blocks, Mermaid diagrams for architecture)',
                name: 'description',
                required: false,
                type: 'string',
            },
            {
                description: 'Ticket status (e.g., "todo", "in_progress", "review", "closed", "backlog")',
                name: 'status',
                required: false,
                type: 'string',
            },
            {
                description: 'Ticket priority (0-10, where 10 is highest priority)',
                name: 'priority',
                required: false,
                type: 'number',
            },
            {
                description: 'Solution plan for implementing the ticket (used by Developer agent)',
                name: 'solution_plan',
                required: false,
                type: 'string',
            },
        ],
    },

    update_ticket_priority: {
        description: 'Update ticket priority (0-10, where 10 is highest priority). Deprecated: Use update_ticket instead.',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {priority, ticketId} = params as {priority: number; ticketId: string}
            try {
                const agentType = context.agent?.getType()
                const result = await updateTicketFields(ticketId, {priority}, agentType)

                if (!result.success) {
                    return {
                        error: result.error || 'Failed to update ticket priority',
                        success: false,
                    }
                }

                return {
                    data: {
                        priority,
                        ticketId,
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to update ticket priority:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'update_ticket_priority',
        parameters: [
            {
                description: 'Ticket ID',
                name: 'ticketId',
                required: true,
                type: 'string',
            },
            {
                description: 'Priority value (0-10, where 10 is highest)',
                name: 'priority',
                required: true,
                type: 'number',
            },
        ],
    },

    update_ticket_status: {
        description:
            'Update ticket status (e.g., "todo", "in_progress", "review", "closed", "backlog"). Deprecated: Use update_ticket instead.',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {status, ticketId} = params as {status: string; ticketId: string}
            try {
                const agentType = context.agent?.getType()
                const result = await updateTicketFields(ticketId, {status}, agentType)

                if (!result.success) {
                    return {
                        error: result.error || 'Failed to update ticket status',
                        success: false,
                    }
                }

                return {
                    data: {
                        status,
                        ticketId,
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[TicketTool] Failed to update ticket status:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'update_ticket_status',
        parameters: [
            {
                description: 'Ticket ID',
                name: 'ticketId',
                required: true,
                type: 'string',
            },
            {
                description: 'New status',
                name: 'status',
                required: true,
                type: 'string',
            },
        ],
    },
}
