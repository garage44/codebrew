/**
 * Interactive CLI for running agents with REPL mode
 */

import {BaseAgent, type AgentContext, type AgentResponse} from '../agent/base.ts'
import {REPL, type REPLOptions} from './repl.ts'
import {executeToolCommand, getToolsHelp} from './command-parser.ts'

/**
 * Create a writable stream for agent reasoning output
 */
function createReasoningStream(
    onMessage: (message: string) => void,
): WritableStream<string> {
    return new WritableStream({
        close() {
            // Stream closed
        },
        write(chunk: string) {
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
    const stream = createReasoningStream((message) => {
        if (onReasoning) {
            onReasoning(message)
        } else {
            process.stdout.write(message)
        }
    })
    agent.setStream(stream)

    // Build default context if not provided
    const agentContext = context || agent.buildContext({})

    // Create REPL interface
    const agentName = agent.name || 'Agent'
    const agentType = agent.getType()
    const prompt = `${agentName}> `

    const welcomeMessage = `\n🤖 ${agentName} Interactive Mode\nType 'help' for available commands, 'exit' to quit.\n`

    // Agent-specific help messages
    const toolsHelp = getToolsHelp(agent.getTools())
    let helpMessage = ''
    if (agentType === 'prioritizer') {
        helpMessage = `\nAvailable commands:
  - Natural language instructions (e.g., "prioritize tickets", "prioritize ticket abc123", "show backlog")
  - Direct tool invocation: tool:tool_name --param=value (e.g., "tool:list_tickets --status=todo")
  - tools - List all available tools
  - help, h - Show this help message
  - clear, cls - Clear the screen
  - exit, quit, q - Exit interactive mode\n`
    } else if (agentType === 'developer') {
        helpMessage = `\nAvailable commands:
  - Natural language instructions (e.g., "work on ticket abc123", "implement ticket xyz", "show my tickets")
  - Direct tool invocation: tool:tool_name --param=value (e.g., "tool:list_tickets --status=todo")
  - tools - List all available tools
  - help, h - Show this help message
  - clear, cls - Clear the screen
  - exit, quit, q - Exit interactive mode\n`
    } else if (agentType === 'reviewer') {
        helpMessage = `\nAvailable commands:
  - Natural language instructions (e.g., "review tickets", "review ticket abc123", "show reviews")
  - Direct tool invocation: tool:tool_name --param=value (e.g., "tool:list_tickets --status=todo")
  - tools - List all available tools
  - help, h - Show this help message
  - clear, cls - Clear the screen
  - exit, quit, q - Exit interactive mode\n`
    } else {
        helpMessage = `\nAvailable commands:
  - Natural language instructions
  - Direct tool invocation: tool:tool_name --param=value
  - tools - List all available tools
  - help, h - Show this help message
  - clear, cls - Clear the screen
  - exit, quit, q - Exit interactive mode\n`
    }

    const replOptions: REPLOptions = {
        prompt,
        welcomeMessage,
        helpMessage,
        async onInput(input: string): Promise<void> {
            try {
                const trimmed = input.trim()

                // Handle "tools" command
                if (trimmed === 'tools') {
                    console.log(getToolsHelp(agent.getTools()))
                    return
                }

                // Try direct tool invocation first
                const toolContext = agent.buildToolContext(agentContext)
                const toolResult = await executeToolCommand(trimmed, agent.getTools(), toolContext)

                if (toolResult !== null) {
                    // Direct tool invocation
                    console.log('\n🔧 Direct Tool Execution:\n')
                    if (toolResult.success) {
                        console.log('✅ Tool executed successfully\n')
                        if (toolResult.data) {
                            console.log(JSON.stringify(toolResult.data, null, 2))
                        }
                        if (toolResult.context) {
                            console.log('\n📊 Context:')
                            console.log(JSON.stringify(toolResult.context, null, 2))
                        }
                    } else {
                        console.error(`❌ Tool execution failed: ${toolResult.error || 'Unknown error'}\n`)
                    }
                    return
                }

                // Process instruction through agent (natural language)
                const response: AgentResponse = await agent.executeInstruction(trimmed, agentContext)

                // Display result
                console.log('\n') // New line after reasoning stream
                if (response.success) {
                    console.log(`✅ ${response.message}`)
                    if (response.data) {
                        console.log(JSON.stringify(response.data, null, 2))
                    }
                } else {
                    console.error(`❌ ${response.message}`)
                    if (response.error) {
                        console.error(`Error: ${response.error}`)
                    }
                }
                console.log('') // Blank line for readability
            } catch(error) {
                const errorMsg = error instanceof Error ? error.message : String(error)
                console.error(`\n❌ Error processing instruction: ${errorMsg}\n`)
            }
        },
        onExit() {
            console.log('\n👋 Goodbye!\n')
        },
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
    const agentContext = context || agent.buildContext({})

    const stream = createReasoningStream((message) => {
        process.stdout.write(message)
    })
    agent.setStream(stream)

    try {
        const response = await agent.executeInstruction(instruction, agentContext)
        console.log('\n') // New line after reasoning stream

        if (response.success) {
            console.log(`✅ ${response.message}`)
            if (response.data) {
                console.log(JSON.stringify(response.data, null, 2))
            }
        } else {
            console.error(`❌ ${response.message}`)
            if (response.error) {
                console.error(`Error: ${response.error}`)
            }
        }

        return response
    } catch(error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`\n❌ Fatal error: ${errorMsg}`)
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
