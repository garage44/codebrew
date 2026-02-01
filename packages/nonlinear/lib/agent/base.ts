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

    constructor(name: string, type: 'prioritizer' | 'developer' | 'reviewer') {
        this.name = name
        this.type = type
        this.model = config.anthropic.model || 'claude-3-5-sonnet-20241022'

        const apiKey = config.anthropic.apiKey || process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            throw new Error(`Anthropic API key not configured for agent ${name}. Set ANTHROPIC_API_KEY environment variable or configure in .nonlinearrc`)
        }

        this.client = new Anthropic({
            apiKey,
        })
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
     * Send a message to the LLM and get a response
     * Uses raw fetch to access rate limit headers
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
