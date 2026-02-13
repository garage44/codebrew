/**
 * Tickets WebSocket API Routes
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {randomId} from '@garage44/common/lib/utils'
import {z} from 'zod'

import type {EnrichedTicketSchema} from '../lib/schemas/tickets.ts'

import {createTask} from '../lib/agent/tasks.ts'
import {validateRequest} from '../lib/api/validate.ts'
import {parseMentions, validateMentions} from '../lib/comments/mentions.ts'
import {
    addTicketAssignee,
    addTicketLabel,
    getDb,
    getLabelDefinition,
    getTicketAssignees,
    getTicketLabels,
    removeTicketAssignee,
    removeTicketLabel,
} from '../lib/database.ts'
import {
    CommentSchema,
    CreateCommentRequestSchema,
    CreateTicketRequestSchema,
    TicketCommentParamsSchema,
    TicketParamsSchema,
    TicketWithRepositorySchema,
    UpdateTicketRequestSchema,
} from '../lib/schemas/tickets.ts'
import {logger} from '../service.ts'

/**
 * Enrich ticket with labels and assignees
 */
function enrichTicket(ticket: z.infer<typeof TicketWithRepositorySchema>): z.infer<typeof EnrichedTicketSchema> {
    const labels = getTicketLabels(ticket.id)
    const labelDefinitions = labels
        .map((label) => {
            const def = getLabelDefinition(label)
            return def ? {color: def.color, name: def.name} : null
        })
        .filter((def): def is {color: string; name: string} => def !== null)

    return {
        ...ticket,
        assignees: getTicketAssignees(ticket.id),
        labelDefinitions: labelDefinitions.length > 0 ? labelDefinitions : undefined,
        labels,
    }
}

export function registerTicketsWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Broadcast comment update (called by agent services)
    wsManager.api.post('/api/tickets/:ticketId/comments/:commentId/broadcast', async (_ctx, req) => {
        const params = validateRequest(TicketCommentParamsSchema, {
            commentId: req.params.commentId,
            ticketId: req.params.ticketId,
        })
        const data = validateRequest(
            z.object({
                type: z.enum(['created', 'updated', 'completed']),
            }),
            req.data,
        )

        // Get comment from database
        const comment = getDb().prepare('SELECT * FROM comments WHERE id = ?').get(params.commentId) as
            | {
                  author_id: string
                  author_type: 'agent' | 'human'
                  content: string
                  created_at: number
                  id: string
                  mentions: string | null
                  responding_to: string | null
                  status: 'generating' | 'completed' | 'failed'
                  ticket_id: string
                  updated_at?: number
              }
            | undefined

        if (comment) {
            const validatedComment = validateRequest(CommentSchema, comment)
            // Broadcast to all clients
            wsManager.broadcast('/tickets', {
                comment: validatedComment,
                ticketId: params.ticketId,
                type: `comment:${data.type}`,
            })
            const eventMsg =
                `[API] Broadcast comment ${data.type} event ` +
                `for comment ${params.commentId} ` +
                `on ticket ${params.ticketId}`
            logger.debug(eventMsg)
        }

        return {success: true}
    })

    // Get all tickets
    wsManager.api.get('/api/tickets', async (_ctx, _req) => {
        const tickets = getDb()
            .prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            ORDER BY t.created_at DESC
        `)
            .all() as {
            assignee_id: string | null
            assignee_type: 'agent' | 'human' | null
            branch_name: string | null
            created_at: number
            description: string | null
            id: string
            merge_request_id: string | null
            priority: number | null
            repository_id: string
            repository_name: string | null
            solution_plan: string | null
            status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
            title: string
            updated_at: number
        }[]

        const validatedTickets = tickets.map((ticket) => {
            const validated = validateRequest(TicketWithRepositorySchema, ticket)
            return enrichTicket(validated)
        })

        return {
            tickets: validatedTickets,
        }
    })

    // Get ticket by ID
    wsManager.api.get('/api/tickets/:id', async (_ctx, req) => {
        const params = validateRequest(TicketParamsSchema, req.params)

        const ticket = getDb()
            .prepare(`
            SELECT t.*, r.name as repository_name, r.path as repository_path
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `)
            .get(params.id) as
            | {
                  assignee_id: string | null
                  assignee_type: 'agent' | 'human' | null
                  branch_name: string | null
                  created_at: number
                  description: string | null
                  id: string
                  merge_request_id: string | null
                  priority: number | null
                  repository_id: string
                  repository_name: string | null
                  repository_path: string | null
                  solution_plan: string | null
                  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
                  title: string
                  updated_at: number
              }
            | undefined

        if (!ticket) {
            throw new Error('Ticket not found')
        }

        /*
         * Validate ticket (without repository_path for enrichment).
         * This is used for enrichment tasks.
         */
        const ticketForEnrichment = validateRequest(TicketWithRepositorySchema, {
            ...ticket,
            repository_path: undefined,
        })

        // Get comments
        const comments = getDb()
            .prepare(`
            SELECT * FROM comments
            WHERE ticket_id = ?
            ORDER BY created_at ASC
        `)
            .all(params.id) as {
            author_id: string
            author_type: 'agent' | 'human'
            content: string
            created_at: number
            id: string
            mentions: string | null
            responding_to: string | null
            status: 'generating' | 'completed' | 'failed'
            ticket_id: string
            updated_at?: number
        }[]

        const validatedComments = comments.map((comment) => validateRequest(CommentSchema, comment))

        return {
            comments: validatedComments,
            ticket: enrichTicket(ticketForEnrichment),
        }
    })

    // Create ticket
    wsManager.api.post('/api/tickets', async (_ctx, req) => {
        const data = validateRequest(CreateTicketRequestSchema, req.data)

        const ticketId = randomId()
        const now = Date.now()

        getDb()
            .prepare(`
            INSERT INTO tickets (
                id, repository_id, title, description, status,
                priority, assignee_type, assignee_id,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
            .run(
                ticketId,
                data.repository_id,
                data.title,
                data.description || null,
                data.status,
                data.priority || null,
                data.assignee_type || null,
                data.assignee_id || null,
                now,
                now,
            )

        // Add labels if provided
        if (data.labels && Array.isArray(data.labels)) {
            for (const label of data.labels) {
                addTicketLabel(ticketId, label)
            }
        }

        // Add assignees if provided
        if (data.assignees && Array.isArray(data.assignees)) {
            for (const assignee of data.assignees) {
                addTicketAssignee(ticketId, assignee.assignee_type, assignee.assignee_id)
            }
        } else if (data.assignee_type && data.assignee_id) {
            // Backward compatibility: add single assignee
            addTicketAssignee(ticketId, data.assignee_type, data.assignee_id)
        } else {
            // Automatically assign to planner agent if no assignees provided
            const plannerAgent = getDb()
                .prepare(`
                SELECT id FROM agents
                WHERE type = 'planner' AND enabled = 1
                LIMIT 1
            `)
                .get() as {id: string} | undefined

            if (plannerAgent) {
                logger.info(`[API] Auto-assigning new ticket ${ticketId} to planner agent ${plannerAgent.id}`)
                addTicketAssignee(ticketId, 'agent', plannerAgent.id)
            } else {
                logger.warn('[API] No enabled planner agent found to auto-assign new ticket')
            }
        }

        // Generate ticket embedding
        try {
            // Queue indexing job (processed by indexing service)
            const {queueIndexingJob} = await import('../lib/indexing/queue.ts')
            await queueIndexingJob({
                ticketId,
                type: 'ticket',
            })
        } catch (error) {
            logger.warn(`[Tickets API] Failed to generate embedding for ticket ${ticketId}:`, error)
            // Continue anyway - embedding can be regenerated later
        }

        const ticket = getDb()
            .prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `)
            .get(ticketId) as
            | {
                  assignee_id: string | null
                  assignee_type: 'agent' | 'human' | null
                  branch_name: string | null
                  created_at: number
                  description: string | null
                  id: string
                  merge_request_id: string | null
                  priority: number | null
                  repository_id: string
                  repository_name: string | null
                  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
                  title: string
                  updated_at: number
              }
            | undefined

        if (!ticket) {
            throw new Error('Failed to create ticket')
        }

        const validatedTicket = validateRequest(TicketWithRepositorySchema, ticket)
        const enrichedTicket = enrichTicket(validatedTicket)

        // Broadcast ticket creation
        wsManager.broadcast('/tickets', {
            ticket: enrichedTicket,
            type: 'ticket:created',
        })

        logger.info(`[API] Created ticket ${ticketId}: ${data.title}`)

        // If ticket is in backlog, create task for PlannerAgent to refine it
        if (data.status === 'backlog') {
            // Find PlannerAgent ID
            const plannerAgent = getDb()
                .prepare(`
                SELECT id FROM agents
                WHERE type = 'planner' AND enabled = 1
                LIMIT 1
            `)
                .get() as {id: string} | undefined

            if (plannerAgent) {
                logger.info(`[API] Creating refinement task for PlannerAgent to refine new backlog ticket ${ticketId}`)

                // Create task with medium priority (backlog refinement is important but not urgent)
                const taskId = createTask(
                    plannerAgent.id,
                    'refinement',
                    {
                        ticket_id: ticketId,
                    },
                    // Medium priority for backlog refinement
                    50,
                )

                // Broadcast task event to agent via WebSocket (for agent service)
                const agentTaskUrl = `/agents/${plannerAgent.id}/tasks`
                wsManager.emitEvent(agentTaskUrl, {
                    task_data: {
                        ticket_id: ticketId,
                    },
                    task_id: taskId,
                    task_type: 'refinement',
                })

                // Created and broadcast refinement task
                logger.info(`[API] Created and broadcast refinement task ${taskId} ` + `for PlannerAgent (ticket: ${ticketId})`)

                // Log task details for debugging
                const task = getDb().prepare('SELECT * FROM agent_tasks WHERE id = ?').get(taskId)
                logger.debug(`[API] Task details: ${JSON.stringify(task)}`)
            } else {
                logger.warn('[API] No enabled PlannerAgent found to refine new ticket')
            }
        }

        return {
            ticket: enrichedTicket,
        }
    })

    // Update ticket
    wsManager.api.put('/api/tickets/:id', async (_ctx, req) => {
        const params = validateRequest(TicketParamsSchema, req.params)
        const updates = validateRequest(UpdateTicketRequestSchema, req.data)

        // Build update query dynamically
        const fields: string[] = []
        const values: (string | number | null)[] = []

        if (updates.title !== undefined) {
            fields.push('title = ?')
            values.push(updates.title)
        }
        if (updates.description !== undefined) {
            fields.push('description = ?')
            values.push(updates.description)
        }
        if (updates.solution_plan !== undefined) {
            fields.push('solution_plan = ?')
            values.push(updates.solution_plan)
        }
        if (updates.status !== undefined) {
            fields.push('status = ?')
            values.push(updates.status)
        }
        if (updates.priority !== undefined) {
            fields.push('priority = ?')
            values.push(updates.priority)
        }
        if (updates.assignee_type !== undefined) {
            fields.push('assignee_type = ?')
            values.push(updates.assignee_type)
        }
        if (updates.assignee_id !== undefined) {
            fields.push('assignee_id = ?')
            values.push(updates.assignee_id)
        }

        // Allow updates even if only labels or assignees are being updated
        if (fields.length === 0 && updates.labels === undefined && updates.assignees === undefined) {
            throw new Error('No fields to update')
        }

        // Only run UPDATE query if there are fields to update
        if (fields.length > 0) {
            fields.push('updated_at = ?')
            values.push(Date.now())
            values.push(params.id)

            const result = getDb()
                .prepare(`
                UPDATE tickets
                SET ${fields.join(', ')}
                WHERE id = ?
            `)
                .run(...values)

            if (result.changes === 0) {
                throw new Error(`Ticket ${params.id} not found`)
            }
        } else {
            // If only labels/assignees are being updated, still update the timestamp
            getDb()
                .prepare(`
                UPDATE tickets
                SET updated_at = ?
                WHERE id = ?
            `)
                .run(Date.now(), params.id)
        }

        // Handle labels update
        if (updates.labels !== undefined) {
            // Get current labels
            const currentLabels = getTicketLabels(params.id)
            const newLabels = updates.labels

            // Remove labels that are no longer present
            for (const label of currentLabels) {
                if (!newLabels.includes(label)) {
                    removeTicketLabel(params.id, label)
                }
            }

            // Add new labels
            for (const label of newLabels) {
                if (!currentLabels.includes(label)) {
                    addTicketLabel(params.id, label)
                }
            }
        }

        // Handle assignees update
        if (updates.assignees !== undefined) {
            // Get current assignees
            const currentAssignees = getTicketAssignees(params.id)
            const newAssignees = updates.assignees

            // Create sets for comparison
            const currentSet = new Set(currentAssignees.map((a) => `${a.assignee_type}:${a.assignee_id}`))
            const newSet = new Set(newAssignees.map((a) => `${a.assignee_type}:${a.assignee_id}`))

            // Remove assignees that are no longer present
            for (const assignee of currentAssignees) {
                const key = `${assignee.assignee_type}:${assignee.assignee_id}`
                if (!newSet.has(key)) {
                    removeTicketAssignee(params.id, assignee.assignee_type, assignee.assignee_id)
                }
            }

            // Add new assignees
            for (const assignee of newAssignees) {
                const key = `${assignee.assignee_type}:${assignee.assignee_id}`
                if (!currentSet.has(key)) {
                    addTicketAssignee(params.id, assignee.assignee_type, assignee.assignee_id)
                }
            }
        }

        // Regenerate ticket embedding if title or description changed
        if (updates.title !== undefined || updates.description !== undefined) {
            try {
                const ticket = getDb().prepare('SELECT title, description FROM tickets WHERE id = ?').get(params.id) as
                    | {
                          description: string | null
                          title: string
                      }
                    | undefined
                if (ticket) {
                    // Queue indexing job (processed by indexing service)
                    const {queueIndexingJob} = await import('../lib/indexing/queue.ts')
                    await queueIndexingJob({
                        ticketId: params.id,
                        type: 'ticket',
                    })
                }
            } catch (error) {
                logger.warn(`[Tickets API] Failed to regenerate embedding for ticket ${params.id}:`, error)
            }
        }

        const ticket = getDb()
            .prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `)
            .get(params.id) as
            | {
                  assignee_id: string | null
                  assignee_type: 'agent' | 'human' | null
                  branch_name: string | null
                  created_at: number
                  description: string | null
                  id: string
                  merge_request_id: string | null
                  priority: number | null
                  repository_id: string
                  repository_name: string | null
                  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
                  title: string
                  updated_at: number
              }
            | undefined

        if (!ticket) {
            throw new Error(`Ticket ${params.id} not found`)
        }

        const validatedTicket = validateRequest(TicketWithRepositorySchema, ticket)
        const enrichedTicket = enrichTicket(validatedTicket)

        // Broadcast ticket update
        wsManager.broadcast('/tickets', {
            ticket: enrichedTicket,
            type: 'ticket:updated',
        })

        return {
            ticket: enrichedTicket,
        }
    })

    // Delete ticket
    wsManager.api.delete('/api/tickets/:id', async (_ctx, req) => {
        const params = validateRequest(TicketParamsSchema, req.params)

        getDb().prepare('DELETE FROM tickets WHERE id = ?').run(params.id)

        // Broadcast ticket deletion
        wsManager.broadcast('/tickets', {
            ticketId: params.id,
            type: 'ticket:deleted',
        })

        logger.info(`[API] Deleted ticket ${params.id}`)

        return {
            success: true,
        }
    })

    // Add comment to ticket
    wsManager.api.post('/api/tickets/:id/comments', async (_ctx, req) => {
        const params = validateRequest(TicketParamsSchema, req.params)
        const data = validateRequest(CreateCommentRequestSchema, req.data)

        // Parse mentions from content if not provided
        const parsedMentions = data.mentions
            ? data.mentions.map((name) => ({name, original: `@${name}`, type: 'agent' as const}))
            : parseMentions(data.content)
        const {invalid: invalidMentions, valid: validMentions} = validateMentions(parsedMentions)

        // Log parsing results
        const mentionOriginals = parsedMentions.map((m) => m.original).join(', ')
        logger.info(`[API] Parsed ${parsedMentions.length} mentions from comment: ${mentionOriginals}`)
        logger.info(`[API] Valid mentions: ${validMentions.length}, Invalid: ${invalidMentions.length}`)

        // Log invalid mentions
        if (invalidMentions.length > 0) {
            logger.warn(`[API] Invalid mentions in comment: ${invalidMentions.map((m) => m.original).join(', ')}`)
        }

        const commentId = randomId()
        const now = Date.now()
        const mentionNames = validMentions.map((m) => m.name)

        getDb()
            .prepare(`
            INSERT INTO comments (
                id, ticket_id, author_type, author_id, content, mentions, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
            .run(
                commentId,
                params.id,
                data.author_type,
                data.author_id,
                data.content,
                mentionNames.length > 0 ? JSON.stringify(mentionNames) : null,
                now,
            )

        const comment = getDb().prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as
            | {
                  author_id: string
                  author_type: 'agent' | 'human'
                  content: string
                  created_at: number
                  id: string
                  mentions: string | null
                  responding_to: string | null
                  status: 'generating' | 'completed' | 'failed'
                  ticket_id: string
                  updated_at?: number
              }
            | undefined

        if (!comment) {
            throw new Error('Failed to create comment')
        }

        const validatedComment = validateRequest(CommentSchema, comment)

        // Create tasks for mentioned agents
        for (const mention of validMentions) {
            if (mention.type === 'agent') {
                // Find agent by name (case-insensitive)
                const agent = getDb()
                    .prepare(`
                    SELECT id, name, type, enabled
                    FROM agents
                    WHERE LOWER(name) = LOWER(?) OR LOWER(id) = LOWER(?)
                `)
                    .get(mention.name, mention.name) as
                    | {
                          enabled: number
                          id: string
                          name: string
                          type: 'planner' | 'developer' | 'reviewer'
                      }
                    | undefined

                if (!agent) {
                    logger.warn(`[API] Agent "${mention.name}" not found when processing mention`)
                    continue
                }

                if (agent.enabled === 0) {
                    logger.warn(`[API] Agent "${agent.name}" is disabled, skipping mention trigger`)
                    continue
                }

                logger.info(
                    `[API] Creating task for agent ${agent.name} (${agent.id}) via mention in comment for ticket ${params.id}`,
                )

                // Create task with high priority (mentions are urgent)
                const taskId = createTask(
                    agent.id,
                    'mention',
                    {
                        author_id: data.author_id,
                        author_type: data.author_type,
                        comment_content: data.content,
                        comment_id: commentId,
                        mentions: mentionNames,
                        ticket_id: params.id,
                    },
                    // High priority for mentions
                    100,
                )

                // Broadcast task event to agent via WebSocket
                wsManager.emitEvent(`/agents/${agent.id}/tasks`, {
                    task_data: {
                        author_id: data.author_id,
                        author_type: data.author_type,
                        comment_content: data.content,
                        comment_id: commentId,
                        mentions: mentionNames,
                        ticket_id: params.id,
                    },
                    task_id: taskId,
                    task_type: 'mention',
                })

                logger.info(`[API] Created and broadcast task ${taskId} for agent ${agent.name}`)
            }
        }

        // Broadcast comment creation
        wsManager.broadcast('/tickets', {
            comment: validatedComment,
            ticketId: params.id,
            type: 'comment:created',
        })

        logger.info(`[API] Added comment to ticket ${params.id}`)

        return {
            comment: validatedComment,
        }
    })

    // Approve ticket (human confirms closure)
    wsManager.api.post('/api/tickets/:id/approve', async (_ctx, req) => {
        const params = validateRequest(TicketParamsSchema, req.params)

        const ticket = getDb().prepare('SELECT * FROM tickets WHERE id = ?').get(params.id) as
            | {
                  id: string
                  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
              }
            | undefined

        if (!ticket) {
            throw new Error('Ticket not found')
        }

        if (ticket.status !== 'closed') {
            throw new Error('Ticket must be in closed status to approve')
        }

        /*
         * Ticket is already closed, approval just confirms it
         * Could add an approval tracking field if needed in the future
         */

        logger.info(`[API] Ticket ${params.id} approved by human`)

        // Broadcast approval
        wsManager.broadcast('/tickets', {
            ticketId: params.id,
            type: 'ticket:approved',
        })

        return {
            message: 'Ticket approved',
            success: true,
        }
    })

    // Reopen ticket
    wsManager.api.post('/api/tickets/:id/reopen', async (_ctx, req) => {
        const params = validateRequest(TicketParamsSchema, req.params)
        const data = validateRequest(
            z.object({
                reason: z.string().optional(),
            }),
            req.data,
        )

        const ticket = getDb().prepare('SELECT * FROM tickets WHERE id = ?').get(params.id) as
            | {
                  id: string
                  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
              }
            | undefined

        if (!ticket) {
            throw new Error('Ticket not found')
        }

        // Add comment explaining reopen
        if (data.reason) {
            const commentId = randomId()
            getDb()
                .prepare(`
                INSERT INTO comments (id, ticket_id, author_type, author_id, content, created_at)
                VALUES (?, ?, 'human', ?, ?, ?)
            `)
                .run(commentId, params.id, 'system', `Reopening ticket: ${data.reason}`, Date.now())
        }

        // Move back to in_progress
        getDb()
            .prepare(`
            UPDATE tickets
            SET status = 'in_progress',
                assignee_type = NULL,
                assignee_id = NULL,
                updated_at = ?
            WHERE id = ?
        `)
            .run(Date.now(), params.id)

        const updatedTicket = getDb()
            .prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `)
            .get(params.id) as
            | {
                  assignee_id: string | null
                  assignee_type: 'agent' | 'human' | null
                  branch_name: string | null
                  created_at: number
                  description: string | null
                  id: string
                  merge_request_id: string | null
                  priority: number | null
                  repository_id: string
                  repository_name: string | null
                  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
                  title: string
                  updated_at: number
              }
            | undefined

        if (!updatedTicket) {
            throw new Error('Ticket not found')
        }

        const validatedTicket = validateRequest(TicketWithRepositorySchema, updatedTicket)
        const enrichedTicket = enrichTicket(validatedTicket)

        // Broadcast ticket update
        wsManager.broadcast('/tickets', {
            ticket: enrichedTicket,
            type: 'ticket:updated',
        })

        logger.info(`[API] Ticket ${params.id} reopened`)

        return {
            ticket: enrichedTicket,
        }
    })

    // Subscribe to ticket updates
    wsManager.on('/tickets', (_ws) => {
        logger.debug('[API] Client subscribed to ticket updates')
    })
}
