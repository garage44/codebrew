/**
 * Prioritization Agent
 * Analyzes backlog tickets and moves high-priority ones to "todo"
 */

import {BaseAgent, type AgentContext, type AgentResponse} from './base.ts'
import {db, addTicketLabel} from '../database.ts'
import {logger} from '../../service.ts'
import {addAgentComment} from './comments.ts'
import {updateTicketFromAgent} from './ticket-updates.ts'

export class PrioritizerAgent extends BaseAgent {
    constructor(agentConfig?: {tools?: string[]; skills?: string[]}) {
        super('Prioritizer', 'prioritizer', agentConfig)
    }

    async process(context: AgentContext): Promise<AgentResponse> {
        try {
            this.log(`Processing request with context: ${JSON.stringify(context)}`)
            // If a specific ticket_id is provided, refine that ticket
            const ticketId = context.ticket_id as string | undefined
            if (ticketId) {
                this.log(`Processing ticket ${ticketId}`)
                const ticket = db.prepare(`
                    SELECT t.*, r.name as repository_name, r.path as repository_path
                    FROM tickets t
                    LEFT JOIN repositories r ON t.repository_id = r.id
                    WHERE t.id = ?
                `).get(ticketId) as {
                    id: string
                    repository_id: string
                    title: string
                    description: string | null
                    repository_name: string | null
                    repository_path: string | null
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
                        await this.refineTicketFromMention(ticket, {
                            commentId,
                            commentContent,
                            authorId: authorId || 'unknown',
                            authorType: (authorType as 'agent' | 'human') || 'human',
                        })
                        return {
                            success: true,
                            message: `Refined ticket ${ticketId} in response to mention`,
                        }
                    } else {
                        // Regular refinement (automatic or manual trigger)
                        this.log(`Regular refinement trigger (no mention)`)
                        if (ticket.repository_path) {
                            await this.refineTicket(ticket)
                        } else {
                            this.log(`Skipping refinement - no repository_path for ticket ${ticketId}`)
                        }
                    }
                } else {
                    this.log(`Ticket ${ticketId} not found`)
                }
            }

            // Get all backlog tickets
            const backlogTickets = db.prepare(`
                SELECT * FROM tickets
                WHERE status = 'backlog'
                ORDER BY created_at ASC
            `).all() as Array<{
                id: string
                repository_id: string
                title: string
                description: string | null
                priority: number | null
                created_at: number
            }>

            if (backlogTickets.length === 0) {
                this.log('No backlog tickets to prioritize')
                return {
                    success: true,
                    message: 'No backlog tickets found',
                }
            }

            this.log(`Analyzing ${backlogTickets.length} backlog tickets`)

            // Get repository information for context
            const repositories = new Map<string, {name: string; path: string}>()
            for (const ticket of backlogTickets) {
                if (!repositories.has(ticket.repository_id)) {
                    const repo = db.prepare('SELECT name, path FROM repositories WHERE id = ?').get(ticket.repository_id) as {name: string; path: string} | undefined
                    if (repo) {
                        repositories.set(ticket.repository_id, repo)
                    }
                }
            }

            // Build context for LLM
            const ticketsContext = backlogTickets.map((ticket) => {
                const repo = repositories.get(ticket.repository_id)
                return {
                    id: ticket.id,
                    title: ticket.title,
                    description: ticket.description || '',
                    repository: repo?.name || 'Unknown',
                    created_at: new Date(ticket.created_at).toISOString(),
                    current_priority: ticket.priority,
                }
            })

            // Get relevant prioritization documentation
            const prioritizationDocs = await this.getRelevantDocs(
                'prioritization guidelines criteria business value technical debt',
                {tags: ['type:prioritization', 'role:product-owner']},
                3
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
            let prioritizations: Array<{
                ticket_id: string
                priority: number
                should_move_to_todo: boolean
                reasoning: string
            }>

            try {
                // Try to extract JSON from response (might have markdown code blocks)
                const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : response
                prioritizations = JSON.parse(jsonStr)
            } catch (error) {
                this.log(`Failed to parse LLM response: ${error}`, 'error')
                return {
                    success: false,
                    message: 'Failed to parse prioritization response',
                    error: String(error),
                }
            }

            // Update tickets in database
            let movedCount = 0
            const updateStmt = db.prepare(`
                UPDATE tickets
                SET priority = ?, status = ?, updated_at = ?
                WHERE id = ?
            `)

            const updateTransaction = db.transaction((prioritizations) => {
                for (const p of prioritizations) {
                    const newStatus = p.should_move_to_todo ? 'todo' : 'backlog'
                    updateStmt.run(p.priority, newStatus, Date.now(), p.ticket_id)

                    if (p.should_move_to_todo) {
                        movedCount++
                        this.log(`Moved ticket ${p.ticket_id} to todo (priority: ${p.priority})`)
                    } else {
                        this.log(`Updated priority for ticket ${p.ticket_id}: ${p.priority}`)
                    }
                }
            })

            updateTransaction(prioritizations)

            this.log(`Prioritization complete: ${movedCount} tickets moved to todo, ${prioritizations.length - movedCount} remain in backlog`)

            return {
                success: true,
                message: `Prioritized ${prioritizations.length} tickets, moved ${movedCount} to todo`,
                data: {
                    total: prioritizations.length,
                    moved: movedCount,
                },
            }
        } catch (error) {
            this.log(`Error during prioritization: ${error}`, 'error')
            return {
                success: false,
                message: 'Prioritization failed',
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    /**
     * Refine a newly created ticket by analyzing it and adding a clarifying comment
     */
    private async refineTicket(ticket: {
        id: string
        repository_id: string
        title: string
        description: string | null
        repository_name: string | null
        repository_path: string | null
    }): Promise<void> {
        try {
            this.log(`Refining ticket ${ticket.id}: ${ticket.title}`)

            // Get repository context if available
            let repositoryContext = ''
            if (ticket.repository_path) {
                try {
                    const fs = await import('fs/promises')
                    const readmePath = `${ticket.repository_path}/README.md`
                    try {
                        const readme = await fs.readFile(readmePath, 'utf-8')
                        repositoryContext = `\n\nRepository README:\n${readme.substring(0, 1000)}`
                    } catch {
                        // README doesn't exist, that's okay
                    }
                } catch {
                    // Can't read repository, that's okay
                }
            }

            // Get relevant documentation for this ticket
            const searchQuery = `${ticket.title} ${ticket.description || ''}`
            const relevantDocs = await this.getRelevantDocs(searchQuery, undefined, 3)

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
- refined_description: A clear, detailed description that improves upon the original (use markdown formatting, code blocks for examples, Mermaid diagrams for architecture)
- analysis: Your analysis of issues found and suggestions for improvement (use markdown formatting)
- should_update_description: boolean indicating if the refined_description is significantly better than the original (only true if substantial improvements were made)

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
                refined_description: string
                analysis: string
                should_update_description?: boolean
            }

            try {
                // Try to extract JSON from response (might have markdown code blocks)
                const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : response
                refinement = JSON.parse(jsonStr)
            } catch (error) {
                // If parsing fails, use the response as analysis and keep original description
                this.log(`Failed to parse refinement response, using as analysis: ${error}`)
                refinement = {
                    refined_description: ticket.description || '',
                    analysis: response,
                    should_update_description: false,
                }
            }

            // Update ticket description with refined version only if agent indicates it should be updated
            // or if the original description is empty/null
            const shouldUpdate = refinement.should_update_description !== false && (
                refinement.should_update_description === true ||
                !ticket.description ||
                ticket.description.trim() === ''
            )

            if (shouldUpdate && refinement.refined_description && refinement.refined_description.trim()) {
                await updateTicketFromAgent(ticket.id, {
                    description: refinement.refined_description.trim(),
                })
                this.log(`Updated ticket ${ticket.id} description with refined version`)
            } else {
                this.log(`Skipping description update for ticket ${ticket.id} - agent indicated no update needed or no refined description provided`)
            }

            // Add comment with analysis and broadcast via WebSocket
            await addAgentComment(ticket.id, this.name, `## Ticket Refinement Analysis\n\n${refinement.analysis}`)

            // Add "refined" label to mark ticket as ready for development
            addTicketLabel(ticket.id, 'refined')
            this.log(`Added "refined" label to ticket ${ticket.id}`)

            this.log(`Refined ticket ${ticket.id}`)
        } catch (error) {
            this.log(`Error refining ticket ${ticket.id}: ${error}`, 'error')
            // Don't throw - refinement failure shouldn't block prioritization
        }
    }

    /**
     * Refine a ticket when triggered via mention in a comment
     * Responds to the user's request in the comment
     */
    private async refineTicketFromMention(
        ticket: {
            id: string
            repository_id: string
            title: string
            description: string | null
            repository_name: string | null
            repository_path: string | null
        },
        mention: {
            commentId: string
            commentContent: string
            authorId: string
            authorType: 'agent' | 'human'
        },
    ): Promise<void> {
        try {
            this.log(`Refining ticket ${ticket.id} in response to mention from ${mention.authorId}`)
            this.log(`Comment content: ${mention.commentContent.substring(0, 200)}...`)
            this.log(`Ticket title: ${ticket.title}`)

            // Get repository context if available
            let repositoryContext = ''
            if (ticket.repository_path) {
                try {
                    const fs = await import('fs/promises')
                    const readmePath = `${ticket.repository_path}/README.md`
                    try {
                        const readme = await fs.readFile(readmePath, 'utf-8')
                        repositoryContext = `\n\nRepository README:\n${readme.substring(0, 1000)}`
                    } catch {
                        // README doesn't exist, that's okay
                    }
                } catch {
                    // Can't read repository, that's okay
                }
            }

            // Get recent comments for context
            const recentComments = db.prepare(`
                SELECT author_type, author_id, content, created_at
                FROM comments
                WHERE ticket_id = ?
                ORDER BY created_at DESC
                LIMIT 10
            `).all(ticket.id) as Array<{
                author_type: string
                author_id: string
                content: string
                created_at: number
            }>

            const systemPrompt = `You are a project management AI agent that refines and clarifies software development tickets.

You have been mentioned in a comment by ${mention.authorType === 'human' ? 'a human user' : 'another agent'} who asked you to refine this ticket.

Your task is to:
1. Read and understand what the user requested in their comment
2. Analyze the ticket title and description
3. Provide a refined, clear description that addresses the user's request
4. Respond directly to the user's comment in a conversational way
5. If architectural changes are involved, include Mermaid diagrams to visualize them

IMPORTANT: The user mentioned you and asked you to do something. You MUST:
- Acknowledge the mention and respond to their request
- Be concise and direct (especially if they asked you to be brief)
- Update the description if they asked for refinement
- Always add a comment responding to their request

Respond with a JSON object containing:
- refined_description: A clear, detailed description that improves upon the original (use markdown formatting, code blocks for examples, Mermaid diagrams for architecture). Only update if the user requested refinement or if significant improvements are needed.
- response_comment: A conversational comment responding to the user's request. Acknowledge what they asked and explain what you did.
- should_update_description: boolean indicating if the refined_description should replace the current description

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
${recentComments.map(c => `- ${c.author_type} (${c.author_id}): ${c.content}`).join('\n')}

Please respond to the user's request and refine the ticket as requested.`

            this.log(`Calling LLM to generate refinement response...`)
            const response = await this.respond(systemPrompt, userMessage)
            this.log(`Received LLM response (${response.length} chars)`)

            // Parse the response
            let refinement: {
                refined_description: string
                response_comment: string
                should_update_description?: boolean
            }

            try {
                // Try to extract JSON from response (might have markdown code blocks)
                const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : response
                refinement = JSON.parse(jsonStr)
                this.log(`Successfully parsed refinement JSON`)
            } catch (error) {
                // If parsing fails, create a response comment and keep original description
                this.log(`Failed to parse refinement response, creating simple response: ${error}`, 'error')
                this.log(`Raw response: ${response.substring(0, 500)}`)
                refinement = {
                    refined_description: ticket.description || '',
                    response_comment: `I received your mention. ${response.substring(0, 500)}`,
                    should_update_description: false,
                }
            }

            // Update ticket description if requested and appropriate
            const shouldUpdate = refinement.should_update_description === true ||
                (!ticket.description || ticket.description.trim() === '')

            this.log(`Should update description: ${shouldUpdate}, has refined_description: ${!!refinement.refined_description}`)

            if (shouldUpdate && refinement.refined_description && refinement.refined_description.trim()) {
                this.log(`Updating ticket ${ticket.id} description...`)
                await updateTicketFromAgent(ticket.id, {
                    description: refinement.refined_description.trim(),
                })
                this.log(`Updated ticket ${ticket.id} description in response to mention`)
            }

            // Add comment responding to the mention
            const commentContent = refinement.response_comment || 'I received your mention and will refine the ticket.'
            this.log(`Adding response comment: ${commentContent.substring(0, 100)}...`)
            await addAgentComment(ticket.id, this.name, commentContent)
            this.log(`Successfully added comment to ticket ${ticket.id}`)

            // Add "refined" label to mark ticket as ready for development
            addTicketLabel(ticket.id, 'refined')
            this.log(`Added "refined" label to ticket ${ticket.id}`)

            this.log(`Completed mention response for ticket ${ticket.id}`)
        } catch (error) {
            this.log(`Error responding to mention for ticket ${ticket.id}: ${error}`, 'error')
            // Add error comment so user knows something went wrong
            await addAgentComment(ticket.id, this.name, `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}`).catch(() => {
                // Ignore errors adding error comment
            })
        }
    }
}
