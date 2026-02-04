/**
 * Interactive CLI for agent execution
 * Provides real-time reasoning display similar to Cursor CLI
 */

import {logger} from '../../service.ts'
import type {BaseAgent} from '../agent/base.ts'
import type {AgentContext} from '../agent/base.ts'

export interface InteractiveCLIOptions {
    agent: BaseAgent
    context: AgentContext
    onReasoning?: (message: string) => void
    onToolExecution?: (toolName: string, params: Record<string, unknown>) => void
    onToolResult?: (toolName: string, result: {error?: string; success: boolean}) => void
}

/**
 * Create a writable stream for agent reasoning output
 */
export function createReasoningStream(
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

/**
 * Run agent with interactive CLI output
 */
export async function runAgentInteractive(options: InteractiveCLIOptions): Promise<void> {
    const {agent, context, onReasoning, onToolExecution: _onToolExecution, onToolResult: _onToolResult} = options

    // Set up streaming
    const stream = createReasoningStream((message) => {
        if (onReasoning) {
            onReasoning(message)
        } else {
            process.stdout.write(message)
        }
    })
    agent.setStream(stream)

    try {
        const agentName = (agent as unknown as {name: string}).name
        logger.info(`[InteractiveCLI] Starting agent: ${agentName}`)

        // Run agent process
        const result = await agent.process(context)

        if (result.success) {
            logger.info(`[InteractiveCLI] Agent completed: ${result.message}`)
            if (onReasoning) {
                onReasoning(`\n✅ Agent completed successfully: ${result.message}\n`)
            }
        } else {
            logger.error(`[InteractiveCLI] Agent failed: ${result.error}`)
            if (onReasoning) {
                onReasoning(`\n❌ Agent failed: ${result.error || result.message}\n`)
            }
        }
    } catch(error) {
        logger.error('[InteractiveCLI] Error running agent:', error)
        if (onReasoning) {
            onReasoning(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`)
        }
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
