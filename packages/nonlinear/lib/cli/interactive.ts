/**
 * Interactive CLI for running agents with REPL mode
 */

import pc from 'picocolors'
import type {AgentContext, AgentResponse, BaseAgent} from '../agent/base.ts'
import {REPL, type REPLOptions} from './repl.ts'
import {executeToolCommand, getToolsHelp, getToolsList} from './command-parser.ts'
import {getPendingTasks, markTaskCompleted, markTaskFailed, markTaskProcessing} from '../agent/tasks.ts'
import {runAgent as runAgentScheduler} from '../agent/scheduler.ts'
import {db} from '../database.ts'

/**
 * Create a writable stream for agent reasoning output
 */
function createReasoningStream(
    onMessage: (message: string) => void,
): WritableStream<string> {
    return new WritableStream({
        close(): void {
            // Stream closed
        },
        write(chunk: string): void {
            onMessage(chunk)
        },
    })
}

export interface InteractiveCLIOptions {
    agent: BaseAgent
    context?: AgentContext
    onReasoning?: (message: string) => void
    onToolExecution?: (toolName: string, params: Record<string, unknown>) => void
    onToolResult?: (toolName: string, result: {error?: string; success: boolean}) => void
}

/**
 * Run agent in interactive REPL mode
 * Agent starts idle and waits for user instructions
 */
export async function runAgentInteractive(options: InteractiveCLIOptions): Promise<void> {
    const {agent, context, onReasoning} = options

    // Create reasoning stream for real-time output
    const stream = createReasoningStream((message): void => {
        if (onReasoning) {
            onReasoning(message)
        } else {
            process.stdout.write(message)
        }
    })
    agent.setStream(stream)

    // Build default context if not provided
    const agentContext = context || agent.buildToolContext({})

    // Create REPL interface
    const agentName = agent.getName() || 'Agent'
    const agentType = agent.getType()
    const prompt = `${agentName}> `

    // Check for pending tasks on startup
    let pendingTasksMessage = ''
    try {
        // Get agent ID from database
        const agentRecord = db.prepare(`
            SELECT id FROM agents
            WHERE name = ? OR id = ?
            LIMIT 1
        `).get(agentName, agentName) as {id: string} | undefined

        if (agentRecord) {
            const pendingTasks = getPendingTasks(agentRecord.id)
            if (pendingTasks.length > 0) {
                pendingTasksMessage = `\n${pc.yellow(`⚠️  Found ${pendingTasks.length} pending task(s) in queue.`)}\n` +
                    `Type ${pc.yellow('process-pending')} or ${pc.yellow('catch-up')} to process them.\n`
            }
        }
    } catch{
        // Silently fail - database might not be initialized or agent not found
    }

    const welcomeMessage = `\n${pc.bold(pc.cyan(`${agentName} Interactive Mode`))}\n` +
        `Type ${pc.yellow('help')} for available commands, ${pc.yellow('exit')} to quit.${pendingTasksMessage}\n`

    // Agent-specific help messages
    let helpMessage = ''
    if (agentType === 'planner') {
        helpMessage = `\n${pc.bold('Available commands:')}
  ${pc.cyan('Natural language')} - e.g., ${pc.gray('"prioritize tickets"')}, ${pc.gray('"show backlog"')}
  ${pc.cyan('tool:tool_name')} - Direct tool invocation, e.g., ${pc.gray('tool:list_tickets --status=todo')}
  ${pc.yellow('process-pending')}, ${pc.yellow('catch-up')}, ${pc.yellow('pending')} - Process pending tasks from queue
  ${pc.yellow('tools')} - List all available tools (compact)
  ${pc.yellow('tools --help')} - Detailed tool documentation
  ${pc.yellow('help')}, ${pc.yellow('h')} - Show this help message
  ${pc.yellow('clear')}, ${pc.yellow('cls')} - Clear the screen
  ${pc.yellow('exit')}, ${pc.yellow('quit')}, ${pc.yellow('q')} - Exit interactive mode\n`
    } else if (agentType === 'developer') {
        helpMessage = `\n${pc.bold('Available commands:')}
  ${pc.cyan('Natural language')} - e.g., ${pc.gray('"work on ticket abc123"')}, ${pc.gray('"show my tickets"')}
  ${pc.cyan('tool:tool_name')} - Direct tool invocation, e.g., ${pc.gray('tool:list_tickets --status=todo')}
  ${pc.yellow('process-pending')}, ${pc.yellow('catch-up')}, ${pc.yellow('pending')} - Process pending tasks from queue
  ${pc.yellow('tools')} - List all available tools (compact)
  ${pc.yellow('tools --help')} - Detailed tool documentation
  ${pc.yellow('help')}, ${pc.yellow('h')} - Show this help message
  ${pc.yellow('clear')}, ${pc.yellow('cls')} - Clear the screen
  ${pc.yellow('exit')}, ${pc.yellow('quit')}, ${pc.yellow('q')} - Exit interactive mode\n`
    } else if (agentType === 'reviewer') {
        helpMessage = `\n${pc.bold('Available commands:')}
  ${pc.cyan('Natural language')} - e.g., ${pc.gray('"review tickets"')}, ${pc.gray('"review ticket abc123"')}
  ${pc.cyan('tool:tool_name')} - Direct tool invocation, e.g., ${pc.gray('tool:list_tickets --status=todo')}
  ${pc.yellow('process-pending')}, ${pc.yellow('catch-up')}, ${pc.yellow('pending')} - Process pending tasks from queue
  ${pc.yellow('tools')} - List all available tools (compact)
  ${pc.yellow('tools --help')} - Detailed tool documentation
  ${pc.yellow('help')}, ${pc.yellow('h')} - Show this help message
  ${pc.yellow('clear')}, ${pc.yellow('cls')} - Clear the screen
  ${pc.yellow('exit')}, ${pc.yellow('quit')}, ${pc.yellow('q')} - Exit interactive mode\n`
    } else {
        helpMessage = `\n${pc.bold('Available commands:')}
  ${pc.cyan('Natural language')} - Give instructions in plain English
  ${pc.cyan('tool:tool_name')} - Direct tool invocation
  ${pc.yellow('process-pending')}, ${pc.yellow('catch-up')}, ${pc.yellow('pending')} - Process pending tasks from queue
  ${pc.yellow('tools')} - List all available tools (compact)
  ${pc.yellow('tools --help')} - Detailed tool documentation
  ${pc.yellow('help')}, ${pc.yellow('h')} - Show this help message
  ${pc.yellow('clear')}, ${pc.yellow('cls')} - Clear the screen
  ${pc.yellow('exit')}, ${pc.yellow('quit')}, ${pc.yellow('q')} - Exit interactive mode\n`
    }

    const replOptions: REPLOptions = {
        helpMessage,
        onExit(): void {
            // eslint-disable-next-line no-console
            console.log('\n👋 Goodbye!\n')
        },
        async onInput(input: string): Promise<void> {
            try {
                const trimmed = input.trim()

                // Handle "tools" command
                if (trimmed === 'tools') {
                    // eslint-disable-next-line no-console
                    console.log(getToolsList(agent.getTools()))
                    return
                }

                // Handle "tools --help" command
                if (trimmed === 'tools --help' || trimmed === 'tools -h') {
                    // eslint-disable-next-line no-console
                    console.log(getToolsHelp(agent.getTools()))
                    return
                }

                // Handle "process-pending" or "catch-up" command
                if (trimmed === 'process-pending' || trimmed === 'catch-up' || trimmed === 'pending') {
                    try {
                        // Get agent ID from database
                        const agentRecord = db.prepare(`
                            SELECT id FROM agents
                            WHERE name = ? OR id = ?
                            LIMIT 1
                        `).get(agentName, agentName) as {id: string} | undefined

                        if (!agentRecord) {
                            // eslint-disable-next-line no-console
                            console.log(pc.red('\n❌ Agent not found in database\n'))
                            return
                        }

                        const pendingTasks = getPendingTasks(agentRecord.id)

                        if (pendingTasks.length === 0) {
                            // eslint-disable-next-line no-console
                            console.log(pc.green('\n✅ No pending tasks found\n'))
                            return
                        }

                        // eslint-disable-next-line no-console
                        console.log(pc.cyan(`\n📋 Processing ${pendingTasks.length} pending task(s)...\n`))

                        // Process each task
                        for (const task of pendingTasks) {
                            try {
                                // eslint-disable-next-line no-console
                                console.log(pc.gray(`Processing task ${task.id} (type: ${task.task_type})...`))

                                markTaskProcessing(task.id)

                                const taskData = JSON.parse(task.task_data) as Record<string, unknown>
                                // eslint-disable-next-line no-await-in-loop
                                await runAgentScheduler(agentRecord.id, {
                                    ...taskData,
                                    task_id: task.id,
                                    task_type: task.task_type,
                                })

                                markTaskCompleted(task.id)
                                // eslint-disable-next-line no-console
                                console.log(pc.green(`✅ Completed task ${task.id}\n`))
                            } catch(error: unknown) {
                                const errorMsg = error instanceof Error ? error.message : String(error)
                                markTaskFailed(task.id, errorMsg)
                                // eslint-disable-next-line no-console
                                console.log(pc.red(`❌ Failed task ${task.id}: ${errorMsg}\n`))
                            }
                        }

                        // eslint-disable-next-line no-console
                        console.log(pc.green('\n✅ Finished processing pending tasks\n'))
                    } catch(error: unknown) {
                        const errorMsg = error instanceof Error ? error.message : String(error)
                        // eslint-disable-next-line no-console
                        console.log(pc.red(`\n❌ Error processing pending tasks: ${errorMsg}\n`))
                    }
                    return
                }

                // Try direct tool invocation first
                const toolContext = agent.buildToolContext(agentContext as AgentContext | undefined)
                const toolResult = await executeToolCommand(trimmed, agent.getTools(), toolContext)

                if (toolResult !== null) {
                    // Direct tool invocation
                    // eslint-disable-next-line no-console
                    console.log(`\n${pc.bold(pc.cyan('Direct Tool Execution:'))}\n`)
                    if (toolResult.success) {
                        // eslint-disable-next-line no-console
                        console.log(pc.green('Tool executed successfully\n'))
                        if (toolResult.data) {
                            // eslint-disable-next-line no-console
                            console.log(pc.gray(JSON.stringify(toolResult.data, null, 2)))
                        }
                        if (toolResult.context) {
                            // eslint-disable-next-line no-console
                            console.log(`\n${pc.bold('Context:')}`)
                            // eslint-disable-next-line no-console
                            console.log(pc.gray(JSON.stringify(toolResult.context, null, 2)))
                        }
                    } else {
                        // eslint-disable-next-line no-console
                        console.error(pc.red(`Tool execution failed: ${toolResult.error || 'Unknown error'}\n`))
                    }
                    return
                }

                // Process instruction through agent (natural language)
                const response: AgentResponse = await agent.executeInstruction(trimmed, agentContext as AgentContext)

                /*
                 * Display result
                 * New line after reasoning stream
                 */
                // eslint-disable-next-line no-console
                console.log('\n')
                if (response.success) {
                    // eslint-disable-next-line no-console
                    console.log(pc.green(response.message))
                    if (response.data) {
                        // eslint-disable-next-line no-console
                        console.log(pc.gray(JSON.stringify(response.data, null, 2)))
                    }
                } else {
                    // eslint-disable-next-line no-console
                    console.error(pc.red(response.message))
                    if (response.error) {
                        // eslint-disable-next-line no-console
                        console.error(pc.red(`Error: ${response.error}`))
                    }
                }
                // eslint-disable-next-line no-console
                console.log('') // Blank line for readability
            } catch(error: unknown) {
                const errorMsg = error instanceof Error ? error.message : String(error)
                // eslint-disable-next-line no-console
                console.error(pc.red(`\nError processing instruction: ${errorMsg}\n`))
            }
        },
        prompt,
        welcomeMessage,
    }

    const repl = new REPL(replOptions)
    repl.start()
}

/**
 * Run agent in one-shot mode (non-interactive)
 * Processes a single instruction and exits
 */
export async function runAgentOneShot(
    agent: BaseAgent,
    instruction: string,
    context?: AgentContext,
): Promise<AgentResponse> {
    const agentContext = context || agent.buildToolContext({})

    const stream = createReasoningStream((message): void => {
        process.stdout.write(message)
    })
    agent.setStream(stream)

    try {
        const response = await agent.executeInstruction(instruction, agentContext as AgentContext)
        // New line after reasoning stream
        // eslint-disable-next-line no-console
        console.log('\n')

        if (response.success) {
            // eslint-disable-next-line no-console
            console.log(pc.green(response.message))
            if (response.data) {
                // eslint-disable-next-line no-console
                console.log(pc.gray(JSON.stringify(response.data, null, 2)))
            }
        } else {
            // eslint-disable-next-line no-console
            console.error(pc.red(response.message))
            if (response.error) {
                // eslint-disable-next-line no-console
                console.error(pc.red(`Error: ${response.error}`))
            }
        }

        return response
    } catch(error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(pc.red(`\nFatal error: ${errorMsg}`))
        throw error
    }
}

/**
 * Format reasoning message for display
 */
export function formatReasoningMessage(message: string): string {
    const timestamp = new Date().toISOString()
    return `[${timestamp}] ${message}`
}

/**
 * Format tool execution message
 */
export function formatToolExecution(toolName: string, params: Record<string, unknown>): string {
    return `🔧 Executing tool: ${toolName}\n   Params: ${JSON.stringify(params, null, 2)}\n`
}

/**
 * Format tool result message
 */
export function formatToolResult(toolName: string, success: boolean, error?: string): string {
    if (success) {
        return `✅ Tool ${toolName} completed successfully\n`
    }
    return `❌ Tool ${toolName} failed: ${error || 'Unknown error'}\n`
}
