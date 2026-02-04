/**
 * Base Agent Class
 * All AI agents extend this class to provide common functionality
 */

import Anthropic from '@anthropic-ai/sdk'
import {logger} from '../../service.ts'
import {config} from '../config.ts'
import {updateUsageFromHeaders} from './token-usage.ts'
import {
    unifiedVectorSearch,
    searchDocs as searchDocsVector,
    searchTickets as searchTicketsVector,
    type DocFilters,
} from '../docs/search.ts'
import {loadTools, toolToAnthropic} from '../fixtures/tools/index.ts'
import type {Tool, ToolContext, ToolResult} from '../fixtures/tools/types.ts'
import {loadSkills, buildSkillSystemPrompt} from '../fixtures/skills/index.ts'
import type {Skill} from '../fixtures/skills/types.ts'

export interface AgentContext {
    ticketId?: string
    repositoryId?: string
    branchName?: string
    mergeRequestId?: string
    [key: string]: unknown
}

export interface AgentResponse {
    success: boolean
    message: string
    data?: unknown
    error?: string
}

export abstract class BaseAgent {
    protected client: Anthropic
    protected model: string
    protected name: string
    protected type: 'prioritizer' | 'developer' | 'reviewer'
    protected tools: Record<string, Tool> = {}
    protected skills: Skill[] = []
    protected stream?: WritableStream<string>
    protected apiKey: string

    constructor(name: string, type: 'prioritizer' | 'developer' | 'reviewer', agentConfig?: {tools?: string[]; skills?: string[]}) {
        this.name = name
        this.type = type
        this.model = config.anthropic.model || 'claude-3-5-sonnet-20241022'

        const apiKey = config.anthropic.apiKey || process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            throw new Error(`Anthropic API key not configured for agent ${name}. Set ANTHROPIC_API_KEY environment variable or configure in .nonlinearrc`)
        }

        this.apiKey = apiKey
        this.client = new Anthropic({
            apiKey,
        })

        // Load tools from fixtures based on config
        this.tools = loadTools(agentConfig)

        // Load skills from fixtures based on config
        this.skills = loadSkills(agentConfig)
    }

    /**
     * Process a task with the agent
     * Subclasses must implement this method
     */
    abstract process(context: AgentContext): Promise<AgentResponse>

    /**
     * Get context for the agent (ticket info, repository state, etc.)
     * Subclasses can override this to provide additional context
     */
    protected async getContext(context: AgentContext): Promise<string> {
        // Base implementation - subclasses should extend this
        return JSON.stringify(context, null, 2)
    }

    /**
     * Search documentation and tickets semantically
     * Returns relevant docs and tickets based on query
     */
    protected async semanticSearch(
        query: string,
        options: {
            limit?: number
            contentType?: 'doc' | 'ticket' | 'both'
            filters?: DocFilters
        } = {}
    ) {
        try {
            return await unifiedVectorSearch(query, {
                limit: options.limit || 5,
                contentType: options.contentType || 'both',
                filters: options.filters,
            })
        } catch (error) {
            logger.warn(`[${this.name}] Semantic search failed:`, error)
            return {docs: [], tickets: []}
        }
    }

    /**
     * Search only documentation
     */
    protected async searchDocs(query: string, filters?: DocFilters, limit: number = 5) {
        try {
            return await searchDocsVector(query, filters, limit)
        } catch (error) {
            logger.warn(`[${this.name}] Doc search failed:`, error)
            return []
        }
    }

    /**
     * Search only tickets
     */
    protected async searchTickets(query: string, filters?: DocFilters, limit: number = 5) {
        try {
            return await searchTicketsVector(query, filters, limit)
        } catch (error) {
            logger.warn(`[${this.name}] Ticket search failed:`, error)
            return []
        }
    }

    /**
     * Get relevant documentation for a query
     * Formats results for inclusion in agent context
     */
    protected async getRelevantDocs(query: string, filters?: DocFilters, limit: number = 5): Promise<string> {
        const results = await this.searchDocs(query, filters, limit)

        if (results.length === 0) {
            return 'No relevant documentation found.'
        }

        const formatted = results.map((result, idx) => {
            return `[Doc ${idx + 1}] ${result.doc.title} (${result.doc.path})
Score: ${(result.chunk.score * 100).toFixed(1)}%
Relevant excerpt:
${result.chunk.text.substring(0, 500)}${result.chunk.text.length > 500 ? '...' : ''}

Full content:
${result.doc.content}
`
        }).join('\n\n---\n\n')

        return `Relevant Documentation (${results.length} results):\n\n${formatted}`
    }

    /**
     * Set streaming output for interactive CLI
     */
    setStream(stream: WritableStream<string>): void {
        this.stream = stream
    }

    /**
     * Stream reasoning message
     */
    protected async streamReasoning(message: string): Promise<void> {
        if (this.stream) {
            const writer = this.stream.getWriter()
            await writer.write(`REASONING: ${message}\n`)
            writer.releaseLock()
        }
    }

    /**
     * Build tool context for tool execution
     * Subclasses should override to provide repository-specific context
     */
    protected buildToolContext(context?: AgentContext): ToolContext {
        const toolContext: ToolContext = {
            agent: this,
        }

        // Add context from AgentContext if provided
        if (context) {
            if (context.ticketId) {
                toolContext.ticketId = context.ticketId
            }
            if (context.repositoryId) {
                toolContext.repositoryId = context.repositoryId
            }
            if (context.branchName) {
                toolContext.branchName = context.branchName
            }
            if (context.repositoryPath) {
                toolContext.repositoryPath = context.repositoryPath as string
            }
        }

        return toolContext
    }

    /**
     * Execute a tool
     */
    protected async executeTool(
        toolName: string,
        params: Record<string, unknown>
    ): Promise<ToolResult> {
        const tool = this.tools[toolName]
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`)
        }

        await this.streamReasoning(`Executing tool: ${toolName}`)

        const context = this.buildToolContext()
        const result = await tool.execute(params, context)

        await this.streamReasoning(`Tool ${toolName} completed: ${result.success ? 'success' : 'error'}`)

        return result
    }

    /**
     * Send a message to the LLM with tool use support
     * Uses Anthropic's native tool use API
     */
    protected async respondWithTools(
        systemPrompt: string,
        userMessage: string,
        maxTokens = 4096,
        agentContext?: AgentContext
    ): Promise<string> {
        // Build enhanced system prompt with skills
        const skillPrompt = buildSkillSystemPrompt(this.skills)
        const enhancedSystemPrompt = skillPrompt
            ? `${systemPrompt}\n\n${skillPrompt}`
            : systemPrompt

        const anthropicTools = Object.values(this.tools).map(toolToAnthropic)
        const messages: Array<{role: 'user' | 'assistant', content: unknown}> = [
            {role: 'user', content: userMessage}
        ]

        while (true) {
            await this.streamReasoning('Calling Anthropic API with tools...')

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'x-api-key': this.apiKey,
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: maxTokens,
                    system: enhancedSystemPrompt,
                    messages,
                    tools: anthropicTools.length > 0 ? anthropicTools : undefined,
                }),
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({error: {message: 'Unknown error'}}))
                throw new Error(error.error?.message || `API error: ${response.status}`)
            }

            const data = await response.json()

            // Extract rate limit headers
            const limitHeader = response.headers.get('anthropic-ratelimit-tokens-limit')
            const remainingHeader = response.headers.get('anthropic-ratelimit-tokens-remaining')
            const resetHeader = response.headers.get('anthropic-ratelimit-tokens-reset')

            if (limitHeader && remainingHeader) {
                const limit = parseInt(limitHeader, 10)
                const remaining = parseInt(remainingHeader, 10)
                const used = limit - remaining

                logger.info(`[Agent ${this.name}] Token Usage: ${used}/${limit} (${remaining} remaining)`)

                updateUsageFromHeaders({
                    limit,
                    remaining,
                    reset: resetHeader || undefined,
                })
            }

            // Handle tool_use content blocks
            const toolUses = data.content.filter((c: {type: string}) => c.type === 'tool_use')
            if (toolUses.length === 0) {
                // Final text response
                const textContent = data.content.find((c: {type: string}) => c.type === 'text')
                if (textContent) {
                    await this.streamReasoning('Received final response')
                    return textContent.text
                }
                throw new Error('Unexpected response type from Anthropic API')
            }

            // Execute tools
            await this.streamReasoning(`Executing ${toolUses.length} tool(s)...`)

            const toolResults = await Promise.all(
                toolUses.map(async (toolUse: {id: string; name: string; input: Record<string, unknown>}) => {
                    const tool = this.tools[toolUse.name]
                    if (!tool) {
                        await this.streamReasoning(`ERROR: Tool not found: ${toolUse.name}`)
                        return {
                            tool_use_id: toolUse.id,
                            content: 'Tool not found',
                            is_error: true,
                        }
                    }

                    await this.streamReasoning(`Executing tool: ${toolUse.name}`)
                    const toolContext = this.buildToolContext(agentContext)
                    const result = await tool.execute(toolUse.input, toolContext)
                    await this.streamReasoning(`Tool ${toolUse.name} completed: ${result.success ? 'success' : 'error'}`)

                    return {
                        tool_use_id: toolUse.id,
                        content: JSON.stringify({
                            success: result.success,
                            data: result.data,
                            context: result.context,
                        }),
                    }
                })
            )

            // Add assistant message with tool uses
            messages.push({
                role: 'assistant',
                content: data.content,
            })

            // Add user message with tool results
            messages.push({
                role: 'user',
                content: toolResults,
            })
        }
    }

    /**
     * Send a message to the LLM and get a response
     * Uses raw fetch to access rate limit headers
     * For backward compatibility - use respondWithTools for tool support
     */
    protected async respond(systemPrompt: string, userMessage: string, maxTokens = 4096): Promise<string> {
        try {
            const apiKey = config.anthropic.apiKey || process.env.ANTHROPIC_API_KEY
            if (!apiKey) {
                throw new Error('Anthropic API key not configured')
            }

            // Use raw fetch to access response headers
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: maxTokens,
                    system: systemPrompt,
                    messages: [
                        {
                            role: 'user',
                            content: userMessage,
                        },
                    ],
                }),
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({error: {message: 'Unknown error'}}))
                throw new Error(error.error?.message || `API error: ${response.status}`)
            }

            const data = await response.json()

            // Extract rate limit headers
            const limitHeader = response.headers.get('anthropic-ratelimit-tokens-limit')
            const remainingHeader = response.headers.get('anthropic-ratelimit-tokens-remaining')
            const resetHeader = response.headers.get('anthropic-ratelimit-tokens-reset')

            logger.debug(`[Agent ${this.name}] API Response Headers:`)
            logger.debug(`  anthropic-ratelimit-tokens-limit: ${limitHeader}`)
            logger.debug(`  anthropic-ratelimit-tokens-remaining: ${remainingHeader}`)
            logger.debug(`  anthropic-ratelimit-tokens-reset: ${resetHeader}`)
            logger.debug(`  All headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`)

            if (limitHeader && remainingHeader) {
                const limit = parseInt(limitHeader, 10)
                const remaining = parseInt(remainingHeader, 10)
                const used = limit - remaining

                logger.info(`[Agent ${this.name}] Token Usage: ${used}/${limit} (${remaining} remaining)`)

                updateUsageFromHeaders({
                    limit,
                    remaining,
                    reset: resetHeader || undefined,
                })
            } else {
                logger.warn(`[Agent ${this.name}] Rate limit headers not found in response`)
            }

            const content = data.content[0]
            if (content && content.type === 'text') {
                return content.text
            }

            throw new Error('Unexpected response type from Anthropic API')
        } catch (error) {
            logger.error(`[Agent ${this.name}] Error calling Anthropic API: ${error}`)
            throw error
        }
    }

    /**
     * Log agent activity
     */
    protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        const logMessage = `[Agent ${this.name}] ${message}`
        switch (level) {
            case 'info':
                logger.info(logMessage)
                break
            case 'warn':
                logger.warn(logMessage)
                break
            case 'error':
                logger.error(logMessage)
                break
        }
    }

    /**
     * Retry a function with exponential backoff
     */
    protected async retry<T>(
        fn: () => Promise<T>,
        maxAttempts = 3,
        delay = 1000,
    ): Promise<T> {
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn()
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                if (attempt < maxAttempts) {
                    const waitTime = delay * Math.pow(2, attempt - 1)
                    this.log(`Attempt ${attempt} failed, retrying in ${waitTime}ms...`, 'warn')
                    await new Promise((resolve) => setTimeout(resolve, waitTime))
                }
            }
        }

        throw lastError || new Error('Max retry attempts reached')
    }
}
