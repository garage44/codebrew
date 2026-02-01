/**
 * Tickets WebSocket API Routes
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {
    addTicketAssignee,
    addTicketLabel,
    db,
    getLabelDefinition,
    getTicketAssignees,
    getTicketLabels,
    removeTicketAssignee,
    removeTicketLabel,
} from '../lib/database.ts'
import {randomId} from '@garage44/common/lib/utils'
import {logger} from '../service.ts'
import {parseMentions, validateMentions} from '../lib/comments/mentions.ts'
import {triggerAgent} from '../lib/agent/scheduler.ts'

/**
 * Enrich ticket with labels and assignees
 */
function enrichTicket(ticket: {
    [key: string]: unknown
    id: string
}): typeof ticket & {
    assignees: Array<{assignee_id: string; assignee_type: 'agent' | 'human'}>
    labelDefinitions?: Array<{color: string; name: string}>
    labels: string[]
} {
    const labels = getTicketLabels(ticket.id)
    const labelDefinitions = labels.map((label) => {
        const def = getLabelDefinition(label)
        return def ? {color: def.color, name: def.name} : null
    }).filter((def): def is {color: string; name: string} => def !== null)

    return {
        ...ticket,
        assignees: getTicketAssignees(ticket.id),
        labelDefinitions,
        labels,
    }
}

export function registerTicketsWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Get all tickets
    wsManager.api.get('/api/tickets', async(_ctx, _req) => {
        const tickets = db.prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            ORDER BY t.created_at DESC
        `).all() as Array<{
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
        }>

        return {
            tickets: tickets.map(enrichTicket),
        }
    })

    // Get ticket by ID
    wsManager.api.get('/api/tickets/:id', async(_ctx, req) => {
        const ticketId = req.params.id

        const ticket = db.prepare(`
            SELECT t.*, r.name as repository_name, r.path as repository_path
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `).get(ticketId) as {
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
        } | undefined

        if (!ticket) {
            throw new Error('Ticket not found')
        }

        // Get comments
        const comments = db.prepare(`
            SELECT * FROM comments
            WHERE ticket_id = ?
            ORDER BY created_at ASC
        `).all(ticketId)

        return {
            comments,
            ticket: enrichTicket(ticket),
        }
    })

    // Create ticket
    wsManager.api.post('/api/tickets', async(_ctx, req) => {
        const {
            assignee_id,
            assignee_type,
            assignees,
            description,
            labels,
            priority,
            repository_id,
            status = 'backlog',
            title,
        } = req.data as {
            assignee_id?: string | null
            assignee_type?: 'agent' | 'human' | null
            assignees?: Array<{assignee_id: string; assignee_type: 'agent' | 'human'}>
            description?: string
            labels?: string[]
            priority?: number
            repository_id: string
            status?: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
            title: string
        }

        if (!repository_id || !title) {
            throw new Error('repository_id and title are required')
        }

        const ticketId = randomId()
        const now = Date.now()

        db.prepare(`
            INSERT INTO tickets (
                id, repository_id, title, description, status,
                priority, assignee_type, assignee_id,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            ticketId,
            repository_id,
            title,
            description || null,
            status,
            priority || null,
            assignee_type || null,
            assignee_id || null,
            now,
            now,
        )

        // Add labels if provided
        if (labels && Array.isArray(labels)) {
            for (const label of labels) {
                addTicketLabel(ticketId, label)
            }
        }

        // Add assignees if provided
        if (assignees && Array.isArray(assignees)) {
            for (const assignee of assignees) {
                addTicketAssignee(ticketId, assignee.assignee_type, assignee.assignee_id)
            }
        } else if (assignee_type && assignee_id) {
            // Backward compatibility: add single assignee
            addTicketAssignee(ticketId, assignee_type, assignee_id)
        }

        // Generate ticket embedding
        try {
            const {generateTicketEmbedding} = await import('../lib/docs/embeddings.ts')
            await generateTicketEmbedding(ticketId, title, description || null)
        } catch (error) {
            logger.warn(`[Tickets API] Failed to generate embedding for ticket ${ticketId}:`, error)
            // Continue anyway - embedding can be regenerated later
        }

        const ticket = db.prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `).get(ticketId) as {
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
        }

        // Broadcast ticket creation
        wsManager.broadcast('/tickets', {
            ticket: enrichTicket(ticket),
            type: 'ticket:created',
        })

        logger.info(`[API] Created ticket ${ticketId}: ${title}`)

        // If ticket is in backlog, trigger PrioritizerAgent immediately to refine it
        if (status === 'backlog') {
            // Find PrioritizerAgent ID
            const prioritizerAgent = db.prepare(`
                SELECT id FROM agents
                WHERE type = 'prioritizer' AND enabled = 1
                LIMIT 1
            `).get() as {id: string} | undefined

            if (prioritizerAgent) {
                logger.info(`[API] Triggering PrioritizerAgent to refine new backlog ticket ${ticketId}`)
                // Trigger asynchronously so it doesn't block the response
                triggerAgent(prioritizerAgent.id, {ticket_id: ticketId}).catch((error) => {
                    logger.error(`[API] Failed to trigger PrioritizerAgent: ${error}`)
                })
            } else {
                logger.warn('[API] No enabled PrioritizerAgent found to refine new ticket')
            }
        }

        return {
            ticket: enrichTicket(ticket),
        }
    })

    // Update ticket
    wsManager.api.put('/api/tickets/:id', async(_ctx, req) => {
        const ticketId = req.params.id
        const updates = req.data as Partial<{
            assignee_id: string
            assignee_type: string
            assignees: Array<{assignee_id: string; assignee_type: 'agent' | 'human'}>
            description: string
            labels: string[]
            priority: number
            status: string
            title: string
        }>

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
            values.push(ticketId)

            const result = db.prepare(`
                UPDATE tickets
                SET ${fields.join(', ')}
                WHERE id = ?
            `).run(...values)

            if (result.changes === 0) {
                throw new Error(`Ticket ${ticketId} not found`)
            }
        } else {
            // If only labels/assignees are being updated, still update the timestamp
            db.prepare(`
                UPDATE tickets
                SET updated_at = ?
                WHERE id = ?
            `).run(Date.now(), ticketId)
        }

        // Handle labels update
        if (updates.labels !== undefined) {
            // Get current labels
            const currentLabels = getTicketLabels(ticketId)
            const newLabels = updates.labels

            // Remove labels that are no longer present
            for (const label of currentLabels) {
                if (!newLabels.includes(label)) {
                    removeTicketLabel(ticketId, label)
                }
            }

            // Add new labels
            for (const label of newLabels) {
                if (!currentLabels.includes(label)) {
                    addTicketLabel(ticketId, label)
                }
            }
        }

        // Handle assignees update
        if (updates.assignees !== undefined) {
            // Get current assignees
            const currentAssignees = getTicketAssignees(ticketId)
            const newAssignees = updates.assignees

            // Create sets for comparison
            const currentSet = new Set(currentAssignees.map((a) => `${a.assignee_type}:${a.assignee_id}`))
            const newSet = new Set(newAssignees.map((a) => `${a.assignee_type}:${a.assignee_id}`))

            // Remove assignees that are no longer present
            for (const assignee of currentAssignees) {
                const key = `${assignee.assignee_type}:${assignee.assignee_id}`
                if (!newSet.has(key)) {
                    removeTicketAssignee(ticketId, assignee.assignee_type, assignee.assignee_id)
                }
            }

            // Add new assignees
            for (const assignee of newAssignees) {
                const key = `${assignee.assignee_type}:${assignee.assignee_id}`
                if (!currentSet.has(key)) {
                    addTicketAssignee(ticketId, assignee.assignee_type, assignee.assignee_id)
                }
            }
        }

        // Regenerate ticket embedding if title or description changed
        if (updates.title !== undefined || updates.description !== undefined) {
            try {
                const ticket = db.prepare('SELECT title, description FROM tickets WHERE id = ?').get(ticketId) as {
                    title: string
                    description: string | null
                } | undefined
                if (ticket) {
                    const {generateTicketEmbedding} = await import('../lib/docs/embeddings.ts')
                    await generateTicketEmbedding(ticketId, ticket.title, ticket.description)
                }
            } catch (error) {
                logger.warn(`[Tickets API] Failed to regenerate embedding for ticket ${ticketId}:`, error)
            }
        }

        const ticket = db.prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `).get(ticketId) as {
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
        }

        if (!ticket) {
            throw new Error(`Ticket ${ticketId} not found`)
        }

        // Broadcast ticket update
        wsManager.broadcast('/tickets', {
            ticket: enrichTicket(ticket),
            type: 'ticket:updated',
        })

        return {
            ticket: enrichTicket(ticket),
        }
    })

    // Delete ticket
    wsManager.api.delete('/api/tickets/:id', async(_ctx, req) => {
        const ticketId = req.params.id

        db.prepare('DELETE FROM tickets WHERE id = ?').run(ticketId)

        // Broadcast ticket deletion
        wsManager.broadcast('/tickets', {
            ticketId,
            type: 'ticket:deleted',
        })

        logger.info(`[API] Deleted ticket ${ticketId}`)

        return {
            success: true,
        }
    })

    // Add comment to ticket
    wsManager.api.post('/api/tickets/:id/comments', async(_ctx, req) => {
        const ticketId = req.params.id
        const {author_id, author_type, content, mentions: providedMentions} = req.data as {
            author_id: string
            author_type: 'agent' | 'human'
            content: string
            mentions?: string[]
        }

        if (!content || !author_type || !author_id) {
            throw new Error('content, author_type, and author_id are required')
        }

        // Parse mentions from content if not provided
        const parsedMentions = providedMentions ?
                providedMentions.map((name) => ({name, original: `@${name}`, type: 'agent' as const})) :
                parseMentions(content)
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

        db.prepare(`
            INSERT INTO comments (
                id, ticket_id, author_type, author_id, content, mentions, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            commentId,
            ticketId,
            author_type,
            author_id,
            content,
            mentionNames.length > 0 ? JSON.stringify(mentionNames) : null,
            now,
        )

        const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId)

        // Trigger mentioned agents
        for (const mention of validMentions) {
            if (mention.type === 'agent') {
                // Find agent by name (case-insensitive)
                const agent = db.prepare(`
                    SELECT id, name, type, enabled
                    FROM agents
                    WHERE LOWER(name) = LOWER(?) OR LOWER(id) = LOWER(?)
                `).get(mention.name, mention.name) as {
                    enabled: number
                    id: string
                    name: string
                    type: 'prioritizer' | 'developer' | 'reviewer'
                } | undefined

                if (!agent) {
                    logger.warn(`[API] Agent "${mention.name}" not found when processing mention`)
                    continue
                }

                if (agent.enabled === 0) {
                    logger.warn(`[API] Agent "${agent.name}" is disabled, skipping mention trigger`)
                    continue
                }

                logger.info(`[API] Triggering agent ${agent.name} (${agent.id}) via mention in comment for ticket ${ticketId}`)
                // Pass ticket_id and comment content so agent can respond to the mention
                triggerAgent(agent.id, {
                    author_id: author_id,
                    author_type: author_type,
                    comment_content: content,
                    comment_id: commentId,
                    ticket_id: ticketId,
                }).then(() => {
                    logger.info(`[API] Successfully triggered agent ${agent.name} for ticket ${ticketId}`)
                }).catch((error: unknown) => {
                    logger.error(`[API] Failed to trigger agent ${agent.name}: ${error}`)
                    logger.error(`[API] Error details: ${error instanceof Error ? error.stack : String(error)}`)
                })
            }
        }

        // Broadcast comment creation
        wsManager.broadcast('/tickets', {
            comment,
            ticketId,
            type: 'comment:created',
        })

        logger.info(`[API] Added comment to ticket ${ticketId}`)

        return {
            comment,
        }
    })

    // Approve ticket (human confirms closure)
    wsManager.api.post('/api/tickets/:id/approve', async(_ctx, req) => {
        const ticketId = req.params.id

        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as {
            id: string
            status: string
        } | undefined

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

        logger.info(`[API] Ticket ${ticketId} approved by human`)

        // Broadcast approval
        wsManager.broadcast('/tickets', {
            ticketId,
            type: 'ticket:approved',
        })

        return {
            message: 'Ticket approved',
            success: true,
        }
    })

    // Reopen ticket
    wsManager.api.post('/api/tickets/:id/reopen', async(_ctx, req) => {
        const ticketId = req.params.id
        const {reason} = req.data as {reason?: string}

        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as {
            id: string
            status: string
        } | undefined

        if (!ticket) {
            throw new Error('Ticket not found')
        }

        // Add comment explaining reopen
        if (reason) {
            const commentId = randomId()
            db.prepare(`
                INSERT INTO comments (id, ticket_id, author_type, author_id, content, created_at)
                VALUES (?, ?, 'human', ?, ?, ?)
            `).run(
                commentId,
                ticketId,
                'system',
                `Reopening ticket: ${reason}`,
                Date.now(),
            )
        }

        // Move back to in_progress
        db.prepare(`
            UPDATE tickets
            SET status = 'in_progress',
                assignee_type = NULL,
                assignee_id = NULL,
                updated_at = ?
            WHERE id = ?
        `).run(Date.now(), ticketId)

        const updatedTicket = db.prepare(`
            SELECT t.*, r.name as repository_name
            FROM tickets t
            LEFT JOIN repositories r ON t.repository_id = r.id
            WHERE t.id = ?
        `).get(ticketId)

        // Broadcast ticket update
        wsManager.broadcast('/tickets', {
            ticket: updatedTicket,
            type: 'ticket:updated',
        })

        logger.info(`[API] Ticket ${ticketId} reopened`)

        return {
            ticket: updatedTicket,
        }
    })

    // Subscribe to ticket updates
    wsManager.on('/tickets', (_ws) => {
        logger.debug('[API] Client subscribed to ticket updates')
    })
}
