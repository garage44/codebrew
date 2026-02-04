/**
 * Development Agent
 * Picks up "todo" tickets, creates branches, implements code, and creates MRs
 */

import {BaseAgent, type AgentContext, type AgentResponse} from './base.ts'
import {db, addTicketAssignee} from '../database.ts'
import {logger} from '../../service.ts'
import {createGitPlatform} from '../git/index.ts'
import {addAgentComment} from './comments.ts'
import {CIRunner} from '../ci/runner.ts'
import {updateTicketFromAgent} from './ticket-updates.ts'
import {$} from 'bun'
import path from 'node:path'

export class DeveloperAgent extends BaseAgent {
    constructor(agentConfig?: {tools?: string[]}) {
        super('Developer', 'developer', agentConfig)
    }

    async process(context: AgentContext): Promise<AgentResponse> {
        let ticket: {
            id: string
            repository_id: string
            title: string
            description: string | null
            path: string
            platform: 'github' | 'gitlab' | 'local'
            remote_url: string | null
            config: string
        } | undefined

        try {
            // Get a ticket that:
            // 1. Has "refined" label
            // 2. Is assigned to this DeveloperAgent
            // 3. Is in "todo" or "in_progress" status (allows resuming after crash)
            ticket = db.prepare(`
                SELECT DISTINCT t.*, r.path, r.platform, r.remote_url, r.config
                FROM tickets t
                JOIN repositories r ON t.repository_id = r.id
                JOIN ticket_labels tl ON t.id = tl.ticket_id
                JOIN ticket_assignees ta ON t.id = ta.ticket_id
                WHERE t.status IN ('todo', 'in_progress')
                  AND tl.label = 'refined'
                  AND ta.assignee_type = 'agent'
                  AND ta.assignee_id = ?
                ORDER BY t.priority DESC, t.created_at ASC
                LIMIT 1
            `).get(this.name) as typeof ticket

            if (!ticket) {
                this.log('No refined tickets assigned to DeveloperAgent found')
                return {
                    success: true,
                    message: 'No tickets to work on',
                }
            }

            this.log(`Picking up ticket ${ticket.id}: ${ticket.title}`)

            // Update ticket status to in_progress
            db.prepare(`
                UPDATE tickets
                SET status = 'in_progress',
                    updated_at = ?
                WHERE id = ?
            `).run(Date.now(), ticket.id)

            // Ensure this agent is in assignees (may already be there)
            addTicketAssignee(ticket.id, 'agent', this.name)

            // Create branch name
            const branchName = `ticket-${ticket.id}-${Date.now()}`

            // Get git platform adapter
            const repo = {
                id: ticket.repository_id,
                path: ticket.path,
                platform: ticket.platform,
                remote_url: ticket.remote_url,
                config: ticket.config,
            } as const

            const gitPlatform = createGitPlatform(repo)

            // Create branch
            this.log(`Creating branch: ${branchName}`)
            await gitPlatform.createBranch(repo, branchName)

            // Update ticket with branch name
            db.prepare(`
                UPDATE tickets
                SET branch_name = ?,
                    updated_at = ?
                WHERE id = ?
            `).run(branchName, Date.now(), ticket.id)

            // Build agent context for tools
            const agentContext: AgentContext = {
                ticketId: ticket.id,
                repositoryId: ticket.repository_id,
                repositoryPath: ticket.path,
                branchName,
            }

            // Check if solution plan already exists (resume scenario)
            const existingTicket = db.prepare('SELECT solution_plan FROM tickets WHERE id = ?').get(ticket.id) as {
                solution_plan: string | null
            } | undefined

            let solutionPlan = existingTicket?.solution_plan

            // Phase 1: Planning - Generate solution plan if it doesn't exist
            if (!solutionPlan) {
                this.log(`Generating solution plan for ticket ${ticket.id}`)

                const repoContext = await this.getRepositoryContext(ticket.path)

                const planningPrompt = `You are a Developer agent working on a Bun/TypeScript project.

Your task is to analyze the ticket requirements and codebase to create a detailed solution plan.

Use available tools to:
- Search documentation and ADRs for relevant patterns and decisions
- Read relevant files to understand the codebase structure
- Search for similar code patterns and implementations
- Analyze dependencies and types
- Find existing tests for similar functionality
- Review git history for similar past implementations

Generate a comprehensive solution plan in markdown format that includes:
1. Analysis of the ticket requirements
2. Understanding of the codebase structure
3. Step-by-step implementation approach
4. Files that will be created or modified
5. Tests that need to be written
6. Any dependencies or considerations

Be thorough and specific. This plan will guide the implementation phase.`

                const planningMessage = `Create a solution plan for this ticket:

**Title:** ${ticket.title}
**Description:** ${ticket.description || 'No description provided'}

**Repository Context:**
${repoContext}

Use the available tools to gather context and create a detailed solution plan.`

                solutionPlan = await this.respondWithTools(planningPrompt, planningMessage, 8192, agentContext)

                // Store solution plan in ticket
                await updateTicketFromAgent(ticket.id, {solution_plan: solutionPlan})
                this.log(`Solution plan generated and stored for ticket ${ticket.id}`)
            } else {
                this.log(`Using existing solution plan for ticket ${ticket.id}`)
            }

            // Phase 2: Execution - Execute the solution plan using tools
            this.log(`Executing solution plan for ticket ${ticket.id}`)

            const executionPrompt = `You are a Developer agent. Execute the solution plan that was created for this ticket.

Your task is to:
1. Follow the solution plan step by step
2. Use tools to make changes directly (read_file, write_file, etc.)
3. Run tests after making changes
4. Fix any issues that arise
5. Commit changes when complete
6. Create merge request

You have access to tools for:
- Reading and writing files (read_file, write_file)
- Searching code semantically (search_code, find_similar_code)
- Running commands and tests (run_command, run_tests, lint_code)
- Git operations (git_status, git_branch, git_commit, git_create_mr)
- Ticket operations (get_ticket, update_ticket_status, add_ticket_comment)

Work step by step, using tools to implement the solution plan.`

            const executionMessage = `Execute the solution plan for this ticket:

**Title:** ${ticket.title}
**Description:** ${ticket.description || 'No description'}

**Solution Plan:**
${solutionPlan}

Use the available tools to implement the solution plan. Make changes directly using file tools, run tests, and commit changes.`

            // Execute using tools - tools will handle file operations directly
            await this.respondWithTools(executionPrompt, executionMessage, 8192, agentContext)

            // After tools have made changes, commit and create MR
            const originalCwd = process.cwd()
            try {
                process.chdir(ticket.path)

                // Commit changes (tools may have already committed, but ensure we have a commit)
                const gitStatus = await $`git status --porcelain`.cwd(ticket.path).quiet().text()
                if (gitStatus.trim()) {
                    await $`git add -A`.cwd(ticket.path).quiet()
                    await $`git commit -m "Implement: ${ticket.title}"`.cwd(ticket.path).quiet()
                    this.log('Committed changes')
                }

                // Run CI before creating MR
                this.log('Running CI checks...')
                const ciRunner = new CIRunner()
                const ciResult = await ciRunner.run(ticket.id, ticket.path)

                if (!ciResult.success) {
                    this.log(`CI failed: ${ciResult.error}`, 'warn')
                    // Add comment about CI failure
                    await addAgentComment(ticket.id, this.name, `CI checks failed:\n\n${ciResult.output}\n\nFixes applied: ${ciResult.fixesApplied.length}`)

                    // If CI fixed some issues, commit the fixes
                    if (ciResult.fixesApplied.length > 0) {
                        await $`git add -A`.cwd(ticket.path).quiet()
                        await $`git commit -m "Fix: Apply CI auto-fixes"`.cwd(ticket.path).quiet()
                        this.log(`Applied ${ciResult.fixesApplied.length} CI fixes`)
                    } else {
                        // CI failed and couldn't be auto-fixed, mark ticket as needing attention
                        db.prepare(`
                            UPDATE tickets
                            SET status = 'todo',
                                assignee_type = NULL,
                                assignee_id = NULL,
                                updated_at = ?
                            WHERE id = ?
                        `).run(Date.now(), ticket.id)

                        return {
                            success: false,
                            message: 'CI checks failed and could not be auto-fixed',
                            error: ciResult.error,
                        }
                    }
                } else {
                    this.log('CI checks passed')
                    await addAgentComment(ticket.id, this.name, `CI checks passed${ciResult.fixesApplied.length > 0 ? ` (${ciResult.fixesApplied.length} fixes applied)` : ''}`)
                }

                // Create merge request
                const mrId = await gitPlatform.createMergeRequest(
                    repo,
                    branchName,
                    ticket.title,
                    ticket.description || '',
                )

                // Update ticket with MR ID
                db.prepare(`
                    UPDATE tickets
                    SET merge_request_id = ?,
                        status = 'review',
                        updated_at = ?
                    WHERE id = ?
                `).run(mrId, Date.now(), ticket.id)

                this.log(`Ticket ${ticket.id} implementation complete, MR created: ${mrId}`)

                return {
                    success: true,
                    message: `Implementation complete, MR #${mrId} created`,
                    data: {
                        ticketId: ticket.id,
                        branchName,
                        mergeRequestId: mrId,
                    },
                }
            } finally {
                process.chdir(originalCwd)
            }
        } catch (error) {
            this.log(`Error during development: ${error}`, 'error')
            // Revert ticket status back to todo on error
            if (ticket) {
                db.prepare(`
                    UPDATE tickets
                    SET status = 'todo',
                        updated_at = ?
                    WHERE id = ?
                `).run(Date.now(), ticket.id)
                this.log(`Reverted ticket ${ticket.id} status to todo due to error`)
            }
            return {
                success: false,
                message: 'Development failed',
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    private async getRepositoryContext(repoPath: string): Promise<string> {
        try {
            const packageJsonPath = path.join(repoPath, 'package.json')
            const packageJson = await Bun.file(packageJsonPath).text().catch(() => null)

            const readmePath = path.join(repoPath, 'README.md')
            const readme = await Bun.file(readmePath).text().catch(() => null)

            return JSON.stringify({
                packageJson: packageJson ? JSON.parse(packageJson) : null,
                readme: readme || null,
            }, null, 2)
        } catch (error) {
            return `Error reading repository context: ${error}`
        }
    }

    async executeInstruction(instruction: string, context?: AgentContext): Promise<AgentResponse> {
        const systemPrompt = `You are a Developer agent. You implement features and fix bugs based on ticket requirements.

Your role is to:
- Implement code changes for tickets
- Write and run tests
- Create merge requests
- Fix bugs and issues

Available commands:
- "work on ticket <id>" or "work on <id>" - Start working on a specific ticket
- "implement ticket <id>" - Implement the requirements for a ticket
- "fix ticket <id>" - Fix issues in a ticket
- "show ticket <id>" - Show details of a specific ticket
- "show my tickets" - Show tickets assigned to you
- "show tickets not assigned to me" - Show tickets that are NOT assigned to you
- "show statistics" or "stats" - Show ticket statistics

You have access to tools for:
- Reading and writing files
- Searching code
- Running tests and linting
- Git operations (status, commit, create MR)
- Ticket operations (get_ticket, list_tickets, update_ticket_status, add_ticket_comment, get_ticket_statistics)
- Listing tickets with filters: use list_tickets with status, assigneeType/assigneeId for inclusion, or excludeAssigneeType/excludeAssigneeId for exclusion
- When user asks for "tickets not assigned to me", use excludeAssigneeId="me" with excludeAssigneeType="agent"
- Adding comments to tickets (add_ticket_comment) for progress updates or clarifications
- Getting ticket statistics (get_ticket_statistics) for understanding workload

IMPORTANT: You do NOT prioritize tickets. If asked about prioritization, politely redirect the user to the Planner agent.

When given an instruction, interpret it and use the appropriate tools to complete the task.
Follow the project's coding standards and best practices. Write tests for your changes.
Be thorough and ensure the implementation matches the ticket requirements.`

        const agentContext = context || this.buildContext({})

        try {
            const response = await this.respondWithTools(systemPrompt, instruction, 4096, agentContext)
            return {
                success: true,
                message: response,
            }
        } catch(error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            return {
                success: false,
                message: 'Failed to execute instruction',
                error: errorMsg,
            }
        }
    }

}
