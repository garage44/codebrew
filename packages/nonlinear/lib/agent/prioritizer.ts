/**
 * Prioritization Agent
 * Analyzes backlog tickets and moves high-priority ones to "todo"
 */

import {type AgentContext, type AgentResponse, BaseAgent} from './base.ts'
import {addTicketLabel, getDb} from '../database.ts'
import {logger} from '../../service.ts'
import {addAgentComment} from './comments.ts'
import {updateTicketFromAgent} from './ticket-updates.ts'

export class PrioritizerAgent extends BaseAgent {
    constructor(agentConfig?: {skills?: string[]; tools?: string[]}) {
        super('Prioritizer', 'prioritizer', agentConfig)
    }

    async process(context: AgentContext): Promise<AgentResponse> {
        try {
            this.log(`Processing request with context: ${JSON.stringify(context)}`)
            // If a specific ticket_id is provided, refine that ticket
            const ticketId = context.ticket_id as string | undefined
            if (ticketId) {
                this.log(`Processing ticket ${ticketId}`)
                const ticket = getDb().prepare(`
                    SELECT t.*, r.name as repository_name, r.path as repository_path
                    FROM tickets t
                    LEFT JOIN repositories r ON t.repository_id = r.id
                    WHERE t.id = ?
                `).get(ticketId) as {
                    description: string | null
                    id: string
                    repository_id: string
                    repository_name: string | null
                    repository_path: string | null
                    title: string
                } | undefined

                if (ticket) {
                    // Check if this was triggered via mention (has comment_id and comment_content)
                    const commentId = context.comment_id as string | undefined
                    const commentContent = context.comment_content as string | undefined
                    const authorId = context.author_id as string | undefined
                    const authorType = context.author_type as string | undefined

                    if (commentId && commentContent) {
                        // Triggered via mention - respond to the comment
                        this.log(`Detected mention trigger: comment_id=${commentId}, author=${authorId}`)
                        await this.handleMention(ticket, {
                            authorId: authorId || 'unknown',
                            authorType: (authorType as 'agent' | 'human') || 'human',
                            commentContent,
                            commentId,
                        })
                        return {
                            message: `Handled mention for ticket ${ticketId}`,
                            success: true,
                        }
                    }
                        // Regular refinement (automatic or manual trigger)
                        this.log('Regular refinement trigger (no mention)')
                        if (ticket.repository_path) {
                            await this.refineTicket(ticket)
                        } else {
                            this.log(`Skipping refinement - no repository_path for ticket ${ticketId}`)
                        }

                } else {
                    this.log(`Ticket ${ticketId} not found`)
                }
            }

            // Get all backlog tickets
            const backlogTickets = getDb().prepare(`
                SELECT * FROM tickets
                WHERE status = 'backlog'
                ORDER BY created_at ASC
            `).all() as {
                created_at: number
                description: string | null
                id: string
                priority: number | null
                repository_id: string
                title: string
            }[]

            if (backlogTickets.length === 0) {
                this.log('No backlog tickets to prioritize')
                return {
                    message: 'No backlog tickets found',
                    success: true,
                }
            }

            this.log(`Analyzing ${backlogTickets.length} backlog tickets`)

            // Get repository information for context
            const repositories = new Map<string, {name: string; path: string}>()
            for (const ticket of backlogTickets) {
                if (!repositories.has(ticket.repository_id)) {
                    const repo = getDb()
                        .prepare('SELECT name, path FROM repositories WHERE id = ?')
                        .get(ticket.repository_id) as {name: string; path: string} | undefined
                    if (repo) {
                        repositories.set(ticket.repository_id, repo)
                    }
                }
            }

            // Build context for LLM
            const ticketsContext = backlogTickets.map((ticket): {
                created_at: string
                current_priority: number | null
                description: string
                id: string
                repository: string
                repository_name: string
                title: string
            } => {
                const repo = repositories.get(ticket.repository_id)
                return {
                    created_at: new Date(ticket.created_at).toISOString(),
                    current_priority: ticket.priority,
                    description: ticket.description || '',
                    id: ticket.id,
                    repository: repo?.name || 'Unknown',
                    repository_name: repo?.name || 'Unknown',
                    title: ticket.title,
                }
            })

            // Get relevant prioritization documentation
            const prioritizationDocs = await this.getRelevantDocs(
                'prioritization guidelines criteria business value technical debt',
                {tags: ['type:prioritization', 'role:product-owner']},
                3,
            )

            const systemPrompt = `You are a project management AI agent that prioritizes software development tickets.

Your task is to:
1. Analyze each ticket in the backlog
2. Assign a priority score from 0-100 (higher = more urgent)
3. Identify which tickets should be moved to "todo" status (priority >= 70)

Consider:
- Ticket dependencies and blocking relationships
- Business value and user impact
- Technical complexity and effort required
- Urgency and deadlines
- Repository context and project state
- Prioritization guidelines from documentation

${prioritizationDocs}

Respond with a JSON array of objects, each with:
- ticket_id: The ticket ID
- priority: Priority score (0-100)
- should_move_to_todo: boolean (true if priority >= 70)
- reasoning: Brief explanation of the priority`

            const userMessage = `Analyze these backlog tickets and prioritize them:

${JSON.stringify(ticketsContext, null, 2)}`

            const response = await this.respond(systemPrompt, userMessage)

            // Parse LLM response
            let prioritizations: {
                priority: number
                reasoning: string
                should_move_to_todo: boolean
                ticket_id: string
            }[] = []

            try {
                // Try to extract JSON from response (might have markdown code blocks)
                const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : response
                prioritizations = JSON.parse(jsonStr)
            } catch(error) {
                this.log(`Failed to parse LLM response: ${error}`, 'error')
                return {
                    error: String(error),
                    message: 'Failed to parse prioritization response',
                    success: false,
                }
            }

            // Update tickets in database
            let movedCount = 0
            const updateStmt = getDb().prepare(`
                UPDATE tickets
                SET priority = ?, status = ?, updated_at = ?
                WHERE id = ?
            `)

            const updateTransaction = getDb().transaction((prioritizations): void => {
                for (const p of prioritizations) {
                    const newStatus = p.should_move_to_todo ? 'todo' : 'backlog'
                    updateStmt.run(p.priority, newStatus, Date.now(), p.ticket_id)

                    if (p.should_move_to_todo) {
                        movedCount += 1
                        this.log(`Moved ticket ${p.ticket_id} to todo (priority: ${p.priority})`)
                    } else {
                        this.log(`Updated priority for ticket ${p.ticket_id}: ${p.priority}`)
                    }
                }
            })

            updateTransaction(prioritizations)

            this.log(
                `Prioritization complete: ${movedCount} tickets moved to todo, ` +
                `${prioritizations.length - movedCount} remain in backlog`,
            )

            return {
                data: {
                    moved: movedCount,
                    total: prioritizations.length,
                },
                message: `Prioritized ${prioritizations.length} tickets, moved ${movedCount} to todo`,
                success: true,
            }
        } catch(error) {
            this.log(`Error during prioritization: ${error}`, 'error')
            return {
                error: error instanceof Error ? error.message : String(error),
                message: 'Prioritization failed',
                success: false,
            }
        }
    }

    /**
     * Refine a newly created ticket by analyzing it and adding a clarifying comment
     */
    private async refineTicket(ticket: {
        description: string | null
        id: string
        repository_id: string
        repository_name: string | null
        repository_path: string | null
        title: string
    }): Promise<void> {
        try {
            this.log(`Refining ticket ${ticket.id}: ${ticket.title}`)

            // Get repository context if available
            let repositoryContext = ''
            if (ticket.repository_path) {
                try {
                    const fs = await import('node:fs/promises')
                    const readmePath = `${ticket.repository_path}/README.md`
                    try {
                        const readme = await fs.readFile(readmePath, 'utf8')
                        repositoryContext = `\n\nRepository README:\n${readme.slice(0, 1000)}`
                    } catch {
                        // README doesn't exist, that's okay
                    }
                } catch {
                    // Can't read repository, that's okay
                }
            }

            // Get relevant documentation for this ticket
            const searchQuery = `${ticket.title} ${ticket.description || ''}`
            const relevantDocs = await this.getRelevantDocs(searchQuery, {}, 3)

            const systemPrompt = `You are a project management AI agent that refines and clarifies software development tickets.

Your task is to:
1. Analyze the ticket title and description
2. Identify any ambiguities, missing details, or unclear requirements
3. Provide a refined, clear description that makes the ticket actionable
4. Suggest improvements and considerations
5. Reference relevant documentation and guidelines when applicable

Relevant Documentation:
${relevantDocs}
5. If architectural changes are involved, include Mermaid diagrams to visualize them

Respond with a JSON object containing:
- refined_description: A clear, detailed description that improves upon the original
  (use markdown formatting, code blocks for examples, Mermaid diagrams for architecture)
- analysis: Your analysis of issues found and suggestions for improvement (use markdown formatting)
- should_update_description: boolean indicating if the refined_description is significantly better than the original
  (only true if substantial improvements were made)

The refined_description should:
- Be clear and actionable
- Include technical details if missing
- Use markdown formatting (headers, lists, code blocks)
- Include Mermaid diagrams (using \`\`\`mermaid code blocks) for architectural changes, component relationships, or workflows
- Be ready to use as the ticket description

The analysis should:
- Identify specific issues with the original ticket
- Provide actionable suggestions
- Use markdown formatting for readability

Mermaid diagram examples:
- For architecture: \`\`\`mermaid\ngraph TD\n    A[Component A] --> B[Component B]\n\`\`\`
- For workflows: \`\`\`mermaid\nsequenceDiagram\n    User->>API: Request\n    API->>DB: Query\n\`\`\`
- For component relationships: \`\`\`mermaid\nclassDiagram\n    ClassA --> ClassB\n\`\`\``

            const userMessage = `Refine this ticket:

**Title:** ${ticket.title}
**Description:** ${ticket.description || '(No description provided)'}
**Repository:** ${ticket.repository_name || 'Unknown'}${repositoryContext}

Provide a refined description and analysis.`

            const response = await this.respond(systemPrompt, userMessage)

            // Parse the response
            let refinement: {
                analysis: string
                refined_description: string
                should_update_description?: boolean
            } = {
                analysis: '',
                refined_description: '',
            }

            try {
                // Try to extract JSON from response (might have markdown code blocks)
                const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : response
                refinement = JSON.parse(jsonStr)
            } catch(error) {
                // If parsing fails, use the response as analysis and keep original description
                this.log(`Failed to parse refinement response, using as analysis: ${error}`)
                refinement = {
                    analysis: response,
                    refined_description: ticket.description || '',
                    should_update_description: false,
                }
            }

            /*
             * Always update ticket description with refined version if available
             * The refined_description is the improved version that should replace the original
             */
            if (refinement.refined_description && refinement.refined_description.trim()) {
                await updateTicketFromAgent(ticket.id, {
                    description: refinement.refined_description.trim(),
                })
                this.log(`Updated ticket ${ticket.id} description with refined version`)
            } else {
                this.log(`No refined description provided for ticket ${ticket.id}, keeping original`)
            }

            /*
             * Add comment with analysis (optional - provides additional context)
             * The analysis explains what was improved and why
             */
            if (refinement.analysis && refinement.analysis.trim()) {
                await addAgentComment(ticket.id, this.name, `## Refinement Notes\n\n${refinement.analysis}`)
            }

            // Add "refined" label to mark ticket as ready for development
            addTicketLabel(ticket.id, 'refined')
            this.log(`Added "refined" label to ticket ${ticket.id}`)

            this.log(`Refined ticket ${ticket.id}`)
        } catch(error) {
            this.log(`Error refining ticket ${ticket.id}: ${error}`, 'error')
            // Don't throw - refinement failure shouldn't block prioritization
        }
    }

    /**
     * Handle mention intelligently - analyzes intent and responds appropriately
     * Uses streaming comments for real-time feedback
     */
    private async handleMention(
        ticket: {
            description: string | null
            id: string
            repository_id: string
            repository_name: string | null
            repository_path: string | null
            title: string
        },
        mention: {
            authorId: string
            authorType: 'agent' | 'human'
            commentContent: string
            commentId: string
        },
    ): Promise<void> {
        // Create placeholder comment immediately
        const {createAgentCommentPlaceholder, finalizeAgentComment, updateAgentComment} = await import('./comments.ts')
        const responseCommentId = await createAgentCommentPlaceholder(ticket.id, this.name, mention.commentId)
        this.log('Created placeholder comment')

        try {
            /*
             * For now, use the existing refineTicketFromMention logic
             * TODO: Add intelligent intent analysis and streaming LLM responses
             */
            await this.refineTicketFromMention(ticket, mention, responseCommentId)
        } catch(error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            await finalizeAgentComment(responseCommentId, `I encountered an error while processing your request: ${errorMsg}`)
            throw error
        }
    }

    /**
     * Refine a ticket when triggered via mention in a comment
     * Responds to the user's request in the comment
     * @deprecated Use handleMention instead - this is kept for backward compatibility
     */
    private async refineTicketFromMention(
        ticket: {
            description: string | null
            id: string
            repository_id: string
            repository_name: string | null
            repository_path: string | null
            title: string
        },
        mention: {
            authorId: string
            authorType: 'agent' | 'human'
            commentContent: string
            commentId: string
        },
        responseCommentId?: string,
    ): Promise<void> {
        try {
            this.log('Processing mention')
            this.log(`Comment content: ${mention.commentContent.slice(0, 200)}...`)
            this.log(`Ticket title: ${ticket.title}`)

            // Get repository context if available
            let repositoryContext = ''
            if (ticket.repository_path) {
                try {
                    const fs = await import('node:fs/promises')
                    const readmePath = `${ticket.repository_path}/README.md`
                    try {
                        const readme = await fs.readFile(readmePath, 'utf8')
                        repositoryContext = `\n\nRepository README:\n${readme.slice(0, 1000)}`
                    } catch {
                        // README doesn't exist, that's okay
                    }
                } catch {
                    // Can't read repository, that's okay
                }
            }

            // Get recent comments for context
            const recentComments = getDb().prepare(`
                SELECT author_type, author_id, content, created_at
                FROM comments
                WHERE ticket_id = ?
                ORDER BY created_at DESC
                LIMIT 10
            `).all(ticket.id) as {
                author_id: string
                author_type: string
                content: string
                created_at: number
            }[]

            const systemPrompt = `You are a project management AI agent that refines and clarifies software development tickets.

You have been mentioned in a comment by ${
                mention.authorType === 'human' ? 'a human user' : 'another agent'
            } who asked you to refine this ticket.

Your task is to:
1. Read and understand what the user requested in their comment
2. Analyze the ticket title and description
3. Provide a refined, clear description that addresses the user's request
4. Respond directly to the user's comment in a conversational way
5. If architectural changes are involved, include Mermaid diagrams to visualize them
6. If the user asks you to close the ticket, set should_close_ticket to true

IMPORTANT: The user mentioned you and asked you to do something. You MUST:
- Acknowledge the mention and respond to their request
- Be concise and direct (especially if they asked you to be brief)
- ALWAYS provide a refined_description when refinement is requested - this will update the ticket description
- If the user asks to close the ticket, set should_close_ticket to true (do NOT update the description with "closed" text)
- Always add a comment responding to their request

Respond with a JSON object containing:
- refined_description: A clear, detailed description that improves upon the original
  (use markdown formatting, code blocks for examples, Mermaid diagrams for architecture).
  When refinement is requested, you MUST provide this field with an improved version of the description.
  If the user asks to close the ticket, you can still provide a refined description if needed,
  but the ticket will be closed separately.
- response_comment: A conversational comment responding to the user's request.
  Acknowledge what they asked and explain what you did. Do NOT put the refined description here - it goes in refined_description.
- should_update_description: boolean - set to TRUE when you've provided a refined_description that should replace the current description.
  When refinement is explicitly requested, this should be TRUE.
- should_close_ticket: boolean - set to TRUE if the user asked you to close the ticket.
  When this is true, the ticket will be closed using the update_ticket tool. Do NOT put "closed" in the description text.

The refined_description should:
- Be clear and actionable
- Address any specific concerns mentioned in the user's comment
- Use markdown formatting (headers, lists, code blocks)
- Include Mermaid diagrams (using \`\`\`mermaid code blocks) for architectural changes, component relationships, or workflows
- Be ready to use as the ticket description

The response_comment should:
- Acknowledge the mention (@${mention.authorId} or similar)
- Address what the user asked for
- Be conversational and helpful
- If they asked you to be brief, keep it concise
- Use markdown formatting for readability`

            const userMessage = `You were mentioned in this comment:

**Comment from ${mention.authorType} ${mention.authorId}:**
${mention.commentContent}

**Ticket to refine:**
**Title:** ${ticket.title}
**Description:** ${ticket.description || '(No description provided)'}
**Repository:** ${ticket.repository_name || 'Unknown'}${repositoryContext}

**Recent comments on this ticket:**
${recentComments.map((c): string => `- ${c.author_type} (${c.author_id}): ${c.content}`).join('\n')}

Please respond to the user's request and refine the ticket as requested.`

            this.log('Generating response...')

            // Stream response to comment in real-time
            let accumulatedResponse = ''
            let lastBroadcast = ''
            let lastBroadcastTime = 0
            const {updateAgentComment} = await import('./comments.ts')

            const response = await this.respondStreaming(
                systemPrompt,
                userMessage,
                async(chunk: string): Promise<void> => {
                    accumulatedResponse += chunk

                    /*
                     * Try to extract response_comment value incrementally
                     * Find the start of the field value
                     */
                    const startIdx = accumulatedResponse.indexOf('"response_comment"')
                    // eslint-disable-next-line no-negated-condition
                    if (startIdx !== -1) {
                        // Find the colon and opening quote after "response_comment"
                        const afterField = accumulatedResponse.slice(startIdx + '"response_comment"'.length)
                        const colonQuoteMatch = afterField.match(/^\s*:\s*"/)
                        if (colonQuoteMatch) {
                            const valueStart = startIdx + '"response_comment"'.length + colonQuoteMatch[0].length
                            const valueText = accumulatedResponse.slice(valueStart)

                            // Find the end of the string (unescaped quote followed by comma/brace)
                            let endIdx = -1
                            let escaped = false
                            for (let i = 0; i < valueText.length; i += 1) {
                                if (escaped) {
                                    escaped = false
                                } else if (valueText[i] === '\\') {
                                    escaped = true
                                } else if (valueText[i] === '"') {
                                    // Check if followed by comma or closing brace
                                    const nextChar = valueText[i + 1]
                                    if (nextChar === ',' || nextChar === '}' || !nextChar) {
                                        endIdx = i
                                        break
                                    }
                                }
                            }

                            if (endIdx >= 0) {
                                // Complete string - extract and unescape
                                const rawValue = valueText.slice(0, endIdx)
                                try {
                                    const extracted = JSON.parse(`"${rawValue}"`)
                                    if (extracted !== lastBroadcast && responseCommentId) {
                                        lastBroadcast = extracted
                                        await updateAgentComment(responseCommentId, extracted, false)
                                        lastBroadcastTime = Date.now()
                                    }
                                } catch {
                                    // Fallback unescaping
                                    const unescaped = rawValue.replaceAll(String.raw`\n`, '\n').replaceAll(String.raw`\"`, '"').replaceAll(String.raw`\\`, '\\')
                                    if (unescaped !== lastBroadcast && responseCommentId) {
                                        lastBroadcast = unescaped
                                        await updateAgentComment(responseCommentId, unescaped, false)
                                        lastBroadcastTime = Date.now()
                                    }
                                }
                            } else {
                                // Incomplete - show partial with basic unescaping
                                const partial = valueText.replaceAll(String.raw`\n`, '\n').replaceAll(String.raw`\"`, '"').replaceAll(String.raw`\\`, '\\')
                                const now = Date.now()
                                if (partial !== lastBroadcast && now - lastBroadcastTime > 100 && responseCommentId) {
                                    lastBroadcast = partial
                                    await updateAgentComment(responseCommentId, partial, false)
                                    lastBroadcastTime = now
                                }
                            }
                        }
                    } else {
                        // Field not found yet
                        const now = Date.now()
                        if (accumulatedResponse.length > 30 && now - lastBroadcastTime > 500 && responseCommentId) {
                            await updateAgentComment(responseCommentId, 'Generating response...', false)
                            lastBroadcastTime = now
                        }
                    }
                },
            )

            this.log(`Response received (${Math.round(response.length / 1024)}KB)`)

            // Parse the response
            let refinement: {
                refined_description: string
                response_comment: string
                should_close_ticket?: boolean
                should_update_description?: boolean
            } = {
                refined_description: '',
                response_comment: '',
            }

            try {
                // Try to extract JSON from response (might have markdown code blocks)
                const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : response
                refinement = JSON.parse(jsonStr)
                this.log('Parsed response JSON')

                /*
                 * Update comment with just the response_comment field (clean up from raw JSON)
                 * Only update if we didn't already stream it, or if it's different
                 */
                if ((!lastBroadcast || lastBroadcast !== refinement.response_comment) && responseCommentId) {
                    await updateAgentComment(responseCommentId, refinement.response_comment || 'I received your mention.', false)
                }
            } catch{
                // If parsing fails, use what we streamed or create a simple response
                this.log('Failed to parse response JSON', 'error')

                // Use streamed comment if we extracted it, otherwise create fallback
                const fallbackComment = lastBroadcast || 'I received your mention.'
                refinement = {
                    refined_description: ticket.description || '',
                    response_comment: fallbackComment,
                    should_update_description: false,
                }

                // Update comment with fallback
                if (responseCommentId) {
                    await updateAgentComment(responseCommentId, fallbackComment, false)
                }
            }

            /*
             * Update ticket description if refined_description is provided
             * When refinement is explicitly requested (via mention), always update if refined_description exists
             */
            const hasRefinedDescription = refinement.refined_description && refinement.refined_description.trim()
            const shouldUpdate = refinement.should_update_description === true ||
                (!ticket.description || ticket.description.trim() === '') ||
                (hasRefinedDescription && refinement.refined_description.trim() !== ticket.description?.trim())

            if (shouldUpdate && hasRefinedDescription) {
                this.log('Updating ticket description')
                await updateTicketFromAgent(ticket.id, {
                    description: refinement.refined_description.trim(),
                })
            }

            // Close ticket if requested using the update_ticket tool
            if (refinement.should_close_ticket === true) {
                this.log(`Closing ticket ${ticket.id} as requested`)
                const {updateTicketFields} = await import('./ticket-updates.ts')
                const result = await updateTicketFields(ticket.id, {status: 'closed'}, this.type)
                if (result.success) {
                    this.log(`Ticket ${ticket.id} closed successfully`)
                } else {
                    this.log(`Failed to close ticket: ${result.error}`, 'error')
                }
            }

            // Add comment responding to the mention
            const commentContent = refinement.response_comment || 'I received your mention and will refine the ticket.'

            if (responseCommentId) {
                // Use streaming comment finalization
                const {finalizeAgentComment} = await import('./comments.ts')
                await finalizeAgentComment(responseCommentId, commentContent)
            } else {
                // Fallback to legacy method
                await addAgentComment(ticket.id, this.name, commentContent)
            }
            this.log('Comment finalized')

            // Add "refined" label to mark ticket as ready for development
            addTicketLabel(ticket.id, 'refined')
            this.log(`Added "refined" label to ticket ${ticket.id}`)

            this.log('Mention response completed')
        } catch(error) {
            this.log(`Error responding to mention for ticket ${ticket.id}: ${error}`, 'error')
            // Add error comment so user knows something went wrong
            const errorMessage = error instanceof Error ? error.message : String(error)
            await addAgentComment(
                ticket.id,
                this.name,
                `I encountered an error while processing your request: ${errorMessage}`,
            ).catch((): void => {
                // Ignore errors adding error comment
            })
        }
    }

    async executeInstruction(instruction: string, context?: AgentContext): Promise<AgentResponse> {
        const systemPrompt = `You are a Prioritizer agent. You help prioritize tickets in the backlog.

Available commands:
- "prioritize tickets" or "prioritize" - Analyze and prioritize all backlog tickets
- "prioritize ticket <id>" - Prioritize a specific ticket by ID
- "show backlog" - List all backlog tickets
- "refine ticket <id>" - Refine a specific ticket (add details, break down tasks)
- "close ticket <id>" - Close a ticket (use update_ticket tool with status="closed")
- "show statistics" or "stats" - Show ticket statistics and counts

You have access to tools for:
- Ticket operations (get_ticket, list_tickets, update_ticket, update_ticket_status,
  update_ticket_priority, add_ticket_comment, get_ticket_statistics)
- Reading tickets from the database
- Updating ticket fields (title, description, status, priority) using update_ticket tool
- Adding comments to tickets (add_ticket_comment) for refining and breaking down tasks
- Getting ticket statistics (get_ticket_statistics) for counts by status, priority, assignee

When prioritizing tickets:
- Use update_ticket with priority field to set priorities (0-10 scale)
- Higher priority (8-10) = urgent, important work
- Medium priority (5-7) = important but not urgent
- Low priority (1-4) = nice to have
- Priority 0 = unprioritized
- You can update priority and status together in a single update_ticket call

When refining tickets:
- Use update_ticket with description field to update the ticket description
- Use add_ticket_comment to add details, break down tasks, or clarify requirements
- Be thorough and helpful - update the description with refined content, not just comments

When closing tickets:
- Use update_ticket tool with status="closed" to close a ticket
- Do NOT update the description with "closed" text - use the status field instead
- You can add a comment explaining why the ticket was closed if helpful

When given an instruction, interpret it and use the appropriate tools to complete the task.
Be helpful and provide clear feedback about what you're doing.`

        const agentContext = context || this.buildToolContext({})

        try {
            const response = await this.respondWithTools(systemPrompt, instruction, 4096, agentContext as AgentContext)
            return {
                message: response,
                success: true,
            }
        } catch(error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            return {
                error: errorMsg,
                message: 'Failed to execute instruction',
                success: false,
            }
        }
    }
}
