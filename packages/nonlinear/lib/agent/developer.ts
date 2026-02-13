/**
 * Development Agent
 * Picks up "todo" tickets, creates branches, implements code, and creates MRs
 */

import {type AgentContext, type AgentResponse, BaseAgent} from './base.ts'
import {type Repository, addTicketAssignee, getDb} from '../database.ts'
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
            config: string
            description: string | null
            id: string
            path: string
            platform: 'github' | 'gitlab' | 'local'
            remote_url: string | null
            repository_id: string
            title: string
        } | undefined = null as unknown as {
            config: string
            description: string | null
            id: string
            path: string
            platform: 'github' | 'gitlab' | 'local'
            remote_url: string | null
            repository_id: string
            title: string
        } | undefined

        try {
            /*
             * Get a ticket that:
             * 1. Has "refined" label
             * 2. Is assigned to this DeveloperAgent
             * 3. Is in "todo" or "in_progress" status (allows resuming after crash)
             */
            ticket = getDb().prepare(`
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
                    message: 'No tickets to work on',
                    success: true,
                }
            }

            this.log(`Picking up ticket ${ticket.id}: ${ticket.title}`)

            // Update ticket status to in_progress
            getDb().prepare(`
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
                config: ticket.config,
                created_at: 0,
                id: ticket.repository_id,
                name: '',
                path: ticket.path,
                platform: ticket.platform,
                remote_url: ticket.remote_url,
                updated_at: 0,
            } as Repository

            const gitPlatform = createGitPlatform(repo)

            // Create branch
            this.log(`Creating branch: ${branchName}`)
            await gitPlatform.createBranch(repo, branchName)

            // Update ticket with branch name
            getDb().prepare(`
                UPDATE tickets
                SET branch_name = ?,
                    updated_at = ?
                WHERE id = ?
            `).run(branchName, Date.now(), ticket.id)

            // Build agent context for tools
            const agentContext: AgentContext = {
                branchName,
                repositoryId: ticket.repository_id,
                repositoryPath: ticket.path,
                ticketId: ticket.id,
            }

            // Check if solution plan already exists (resume scenario)
            const existingTicket = getDb().prepare('SELECT solution_plan FROM tickets WHERE id = ?').get(ticket.id) as {
                solution_plan: string | null
            } | undefined

            let solutionPlan = existingTicket?.solution_plan

            // Phase 1: Planning - Generate solution plan if it doesn't exist
            if (solutionPlan) {
                // Solution plan exists, skip planning
                this.log(`Using existing solution plan for ticket ${ticket.id}`)
            } else {
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
            await this.respondWithTools(
                executionPrompt,
                executionMessage,
                8192,
                agentContext,
            )

            // After tools have made changes, commit and create MR
            const originalCwd = process.cwd()
            try {
                process.chdir(ticket.path)

                // Commit changes (tools may have already committed, but ensure we have a commit)
                const gitStatusProc = Bun.spawn(['git', 'status', '--porcelain'], {
                    cwd: ticket.path,
                    stderr: 'pipe',
                    stdout: 'pipe',
                })
                const gitStatus = await new Response(gitStatusProc.stdout).text();
                await gitStatusProc.exited;
                if (gitStatus.trim()) {
                    await Bun.spawn(['git', 'add', '-A'], {cwd: ticket.path}).exited;
                    await Bun.spawn(['git', 'commit', '-m', 'Implement: ' + ticket.title], {cwd: ticket.path}).exited;
                    this.log('Committed changes')
                }

                // Run CI before creating MR
                this.log('Running CI checks...')
                const ciRunner = new CIRunner()
                const ciResult = await ciRunner.run(ticket.id, ticket.path)

                if (ciResult.success) {
                    // CI passed
                    this.log('CI checks passed')
                    const ciMessage = ciResult.fixesApplied.length > 0
                        ? 'CI checks passed (' + ciResult.fixesApplied.length + ' fixes applied)'
                        : 'CI checks passed'
                    await addAgentComment(ticket.id, this.name, ciMessage)
                } else {
                    this.log('CI failed: ' + ciResult.error, 'warn')
                    // Add comment about CI failure
                    const failureMessage = 'CI checks failed:\n\n' + ciResult.output + '\n\nFixes applied: ' + ciResult.fixesApplied.length
                    await addAgentComment(ticket.id, this.name, failureMessage)

                    // If CI fixed some issues, commit the fixes
                    if (ciResult.fixesApplied.length > 0) {
                        await Bun.spawn(['git', 'add', '-A'], {cwd: ticket.path}).exited;
                        await Bun.spawn(['git', 'commit', '-m', 'Fix: Apply CI auto-fixes'], {cwd: ticket.path}).exited;
                        this.log('Applied ' + ciResult.fixesApplied.length + ' CI fixes');
                    } else {
                        // CI failed and couldn't be auto-fixed, mark ticket as needing attention
                        getDb().prepare('UPDATE tickets SET status = ?, assignee_type = NULL, assignee_id = NULL, updated_at = ? WHERE id = ?').run('todo', Date.now(), ticket.id)

                        return {
                            error: ciResult.error,
                            message: 'CI checks failed and could not be auto-fixed',
                            success: false,
                        }
                    }
                }

                // Create merge request
                const mrId = await gitPlatform.createMergeRequest(
                    repo,
                    branchName,
                    ticket.title,
                    ticket.description || '',
                )

                // Update ticket with MR ID
                const updateStmt = getDb().prepare('UPDATE tickets SET merge_request_id = ?, status = \'review\', updated_at = ? WHERE id = ?')
                updateStmt.run(mrId, Date.now(), ticket.id)

                this.log(
                    'Ticket ' + ticket.id + ' implementation complete, MR created: ' + mrId,
                )

                return {
                    data: {
                        branchName,
                        mergeRequestId: mrId,
                        ticketId: ticket.id,
                    },
                    message: 'Implementation complete, MR #' + mrId + ' created',
                    success: true,
                }
            } finally {
                process.chdir(originalCwd)
            }
        } catch(error: unknown) {
            this.log('Error during development: ' + error, 'error')
            // Revert ticket status back to todo on error
            if (ticket) {
                getDb().prepare('UPDATE tickets SET status = \'todo\', updated_at = ? WHERE id = ?').run(Date.now(), ticket.id)
                this.log('Reverted ticket ' + ticket.id + ' status to todo due to error')
            }
            return {
                error: error instanceof Error ? error.message : String(error),
                message: 'Development failed',
                success: false,
            }
        }
    }

    private async getRepositoryContext(repoPath: string): Promise<string> {
        try {
            const packageJsonPath = path.join(repoPath, 'package.json')
            const packageJson = await Bun.file(packageJsonPath).text().catch((): null => null)

            const readmePath = path.join(repoPath, 'README.md')
            const readme = await Bun.file(readmePath).text().catch((): null => null)

            return JSON.stringify({
                packageJson: packageJson ? JSON.parse(packageJson) : null,
                readme: readme || null,
            }, null, 2)
        } catch(error: unknown) {
            return 'Error reading repository context: ' + error
        }
    }

    async executeInstruction(instruction: string, context?: AgentContext): Promise<AgentResponse> {
        const systemPrompt = 'You are a Developer agent. You implement features and fix bugs based on ticket requirements.\n\n' +
            'Your role is to:\n' +
            '- Implement code changes for tickets\n' +
            '- Write and run tests\n' +
            '- Create merge requests\n' +
            '- Fix bugs and issues\n\n' +
            'Available commands:\n' +
            '- "work on ticket <id>" or "work on <id>" - Start working on a specific ticket\n' +
            '- "implement ticket <id>" - Implement the requirements for a ticket\n' +
            '- "fix ticket <id>" - Fix issues in a ticket\n' +
            '- "show ticket <id>" - Show details of a specific ticket\n' +
            '- "show my tickets" - Show tickets assigned to you\n' +
            '- "show tickets not assigned to me" - Show tickets that are NOT assigned to you\n' +
            '- "show statistics" or "stats" - Show ticket statistics\n\n' +
            'You have access to tools for:\n' +
            '- Reading and writing files\n' +
            '- Searching code\n' +
            '- Running tests and linting\n' +
            '- Git operations (status, commit, create MR)\n' +
            '- Ticket operations (get_ticket, list_tickets, update_ticket_status, add_ticket_comment, get_ticket_statistics)\n' +
            '- Listing tickets with filters: use list_tickets with status, assigneeType/assigneeId for inclusion, or excludeAssigneeType/excludeAssigneeId for exclusion\n' +
            '- When user asks for "tickets not assigned to me", use excludeAssigneeId="me" with excludeAssigneeType="agent"\n' +
            '- Adding comments to tickets (add_ticket_comment) for progress updates or clarifications\n' +
            '- Getting ticket statistics (get_ticket_statistics) for understanding workload\n\n' +
            'IMPORTANT: You do NOT prioritize tickets. If asked about prioritization, politely redirect the user to the Planner agent.\n\n' +
            'When given an instruction, interpret it and use the appropriate tools to complete the task.\n' +
            'Follow the project\'s coding standards and best practices. Write tests for your changes.\n' +
            'Be thorough and ensure the implementation matches the ticket requirements.'

        const agentContext = context || this.buildToolContext({})

        try {
            const response = await this.respondWithTools(systemPrompt, instruction, 4096, agentContext as AgentContext)
            return {
                message: response,
                success: true,
            }
        } catch(error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            return {
                error: errorMsg,
                message: 'Failed to execute instruction',
                success: false,
            }
        }
    }
}
