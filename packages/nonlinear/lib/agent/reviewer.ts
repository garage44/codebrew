/**
 * Review Agent
 * Reviews merge requests and provides feedback
 */

import {logger} from '../../service.ts'
import {type Repository, getDb} from '../database.ts'
import {createGitPlatform} from '../git/index.ts'
import {type AgentContext, type AgentResponse, BaseAgent} from './base.ts'
import {addAgentComment} from './comments.ts'

export class ReviewerAgent extends BaseAgent {
    constructor(agentConfig?: {skills?: string[]; tools?: string[]}) {
        super('Reviewer', 'reviewer', agentConfig)
    }

    async process(context: AgentContext): Promise<AgentResponse> {
        try {
            // Get a ticket in "review" status
            const ticket = getDb()
                .prepare(`
                SELECT t.*, r.path, r.platform, r.remote_url, r.config
                FROM tickets t
                JOIN repositories r ON t.repository_id = r.id
                WHERE t.status = 'review'
                  AND t.merge_request_id IS NOT NULL
                ORDER BY t.updated_at ASC
                LIMIT 1
            `)
                .get() as
                | {
                      branch_name: string | null
                      config: string
                      description: string | null
                      id: string
                      merge_request_id: string | null
                      path: string
                      platform: 'github' | 'gitlab' | 'local'
                      remote_url: string | null
                      repository_id: string
                      title: string
                  }
                | undefined

            if (!ticket || !ticket.merge_request_id || !ticket.branch_name) {
                this.log('No tickets in review status found')
                return {
                    message: 'No tickets to review',
                    success: true,
                }
            }

            this.log(`Reviewing ticket ${ticket.id}: ${ticket.title}`)

            // Get repository details
            const repository = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(ticket.repository_id) as
                | Repository
                | undefined

            if (!repository) {
                this.log(`Repository ${ticket.repository_id} not found`, 'warn')
                return {
                    message: 'Repository not found',
                    success: false,
                }
            }

            // Get git platform adapter
            const repo: Repository = repository

            const gitPlatform = createGitPlatform(repo)

            // Get MR status
            const mrStatus = await gitPlatform.getStatus(repo, ticket.branch_name)

            if (!mrStatus) {
                this.log(`MR not found for ticket ${ticket.id}`, 'warn')
                return {
                    message: 'Merge request not found',
                    success: false,
                }
            }

            // Get ticket comments for context
            const comments = getDb()
                .prepare(`
                SELECT * FROM comments
                WHERE ticket_id = ?
                ORDER BY created_at ASC
            `)
                .all(ticket.id) as {
                author_id: string
                author_type: string
                content: string
                created_at: number
                id: string
            }[]

            // Review the MR using LLM
            const systemPrompt = `You are a code review AI agent for a Bun/TypeScript project.

Your task is to:
1. Review the merge request changes
2. Check code quality, style, and best practices
3. Verify tests are included and passing
4. Ensure the implementation matches the ticket requirements
5. Provide constructive feedback

Respond with a JSON object containing:
- approved: boolean (true if MR is ready to merge)
- feedback: Array of review comments
- issues: Array of issues found (if any)
- suggestions: Array of improvement suggestions`

            const userMessage = `Review this merge request:

Ticket: ${ticket.title}
Description: ${ticket.description || 'No description'}
MR Status: ${mrStatus.state}
MR URL: ${mrStatus.url}

Previous Comments:
${comments.map((c): string => `- ${c.author_type} (${c.author_id}): ${c.content}`).join('\n')}

Please review the changes and provide feedback.`

            const response = await this.respond(systemPrompt, userMessage, 4096)

            // Parse review response
            let review: {
                approved: boolean
                feedback: {message: string; type: string}[]
                issues?: string[]
                suggestions?: string[]
            } = {
                approved: false,
                feedback: [],
            }

            try {
                const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : response
                review = JSON.parse(jsonStr)
            } catch (error) {
                this.log(`Failed to parse review response: ${error}`, 'error')
                return {
                    error: String(error),
                    message: 'Failed to parse review response',
                    success: false,
                }
            }

            // Add review comment to MR
            const reviewComment = this.formatReviewComment(review)
            await gitPlatform.addComment(repo, ticket.merge_request_id, reviewComment)

            // Add comment to ticket
            await addAgentComment(ticket.id, this.name, reviewComment)

            // Update ticket status
            if (review.approved) {
                // Move to closed (pending human confirmation)
                getDb()
                    .prepare(`
                    UPDATE tickets
                    SET status = 'closed',
                        updated_at = ?
                    WHERE id = ?
                `)
                    .run(Date.now(), ticket.id)

                this.log(`Ticket ${ticket.id} approved and moved to closed`)
            } else {
                // Move back to in_progress for fixes
                getDb()
                    .prepare(`
                    UPDATE tickets
                    SET status = 'in_progress',
                        assignee_type = NULL,
                        assignee_id = NULL,
                        updated_at = ?
                    WHERE id = ?
                `)
                    .run(Date.now(), ticket.id)

                this.log(`Ticket ${ticket.id} needs fixes, moved back to in_progress`)
            }

            return {
                data: {
                    approved: review.approved,
                    issues: review.issues?.length || 0,
                },
                message: review.approved ? 'MR approved' : 'MR needs fixes',
                success: true,
            }
        } catch (error) {
            this.log(`Error during review: ${error}`, 'error')
            return {
                error: error instanceof Error ? error.message : String(error),
                message: 'Review failed',
                success: false,
            }
        }
    }

    private formatReviewComment(review: {
        approved: boolean
        feedback: {message: string; type: string}[]
        issues?: string[]
        suggestions?: string[]
    }): string {
        const lines: string[] = []

        if (review.approved) {
            lines.push('✅ **Approved**')
        } else {
            lines.push('❌ **Changes Requested**')
        }

        lines.push('')

        if (review.feedback && review.feedback.length > 0) {
            lines.push('## Feedback')
            for (const item of review.feedback) {
                lines.push(`- **${item.type}**: ${item.message}`)
            }
            lines.push('')
        }

        if (review.issues && review.issues.length > 0) {
            lines.push('## Issues Found')
            for (const issue of review.issues) {
                lines.push(`- ${issue}`)
            }
            lines.push('')
        }

        if (review.suggestions && review.suggestions.length > 0) {
            lines.push('## Suggestions')
            for (const suggestion of review.suggestions) {
                lines.push(`- ${suggestion}`)
            }
        }

        return lines.join('\n')
    }

    async executeInstruction(instruction: string, context?: AgentContext): Promise<AgentResponse> {
        const systemPrompt = `You are a Reviewer agent. You review merge requests and provide feedback.

Available commands:
- "review tickets" or "review" - Review all tickets in review status
- "review ticket <id>" - Review a specific ticket's merge request
- "show reviews" - List tickets waiting for review

You have access to tools for:
- Reading tickets and merge request information
- Accessing git platform APIs (GitHub, GitLab)
- Adding comments to merge requests and tickets
- Updating ticket statuses based on review results

When given an instruction, interpret it and use the appropriate tools to complete the task.
Provide constructive feedback and check for code quality, tests, and adherence to requirements.`

        const agentContext = context || this.buildToolContext({})

        try {
            const response = await this.respondWithTools(systemPrompt, instruction, 4096, agentContext as AgentContext)
            return {
                message: response,
                success: true,
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            return {
                error: errorMsg,
                message: 'Failed to execute instruction',
                success: false,
            }
        }
    }
}
