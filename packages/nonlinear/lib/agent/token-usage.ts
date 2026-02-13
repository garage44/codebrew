/**
 * Token Usage Tracker
 * Retrieves Anthropic API token usage from rate limit headers
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {config} from '../config.ts'
import {logger} from '../../service.ts'

interface TokenUsageState {
    count: number
    limit: number
    loading: boolean
}

const tokenUsage: TokenUsageState = {
    count: 0,
    limit: config.anthropic.tokenLimit || 1_000_000,
    loading: false,
}

let wsManager: WebSocketServerManager | null = null

/**
 * Initialize token usage tracking
 */
export function initTokenUsageTracking(manager: WebSocketServerManager): void {
    wsManager = manager
    logger.info('[Token Usage] Initialized token usage tracking (usage retrieved from API response headers)')
}

/**
 * Update usage from API response headers
 * Called when we receive rate limit headers from API responses
 */
export function updateUsageFromHeaders(headers: {
    limit?: number
    remaining?: number
    reset?: string
}): void {
    logger.debug(`[Token Usage] updateUsageFromHeaders called with: ${JSON.stringify(headers)}`)

    if (headers.limit !== null && headers.remaining !== null) {
        const used = headers.limit - headers.remaining
        const oldCount = tokenUsage.count
        const oldLimit = tokenUsage.limit

        tokenUsage.count = used
        tokenUsage.limit = headers.limit
        tokenUsage.loading = false

        logger.info(
            `[Token Usage] Updated: ${oldCount}/${oldLimit} -> ${tokenUsage.count}/${tokenUsage.limit} ` +
            `(${headers.remaining} remaining)`,
        )

        // Broadcast usage update
        if (wsManager) {
            wsManager.broadcast('/anthropic', {
                type: 'usage:updated',
                usage: {
                    count: tokenUsage.count,
                    limit: tokenUsage.limit,
                    loading: false,
                },
            })
            logger.debug('[Token Usage] Broadcasted usage update via WebSocket')
        } else {
            logger.warn('[Token Usage] WebSocket manager not initialized, cannot broadcast')
        }
    } else {
        logger.warn(`[Token Usage] Invalid headers provided: limit=${headers.limit}, remaining=${headers.remaining}`)
    }
}

/**
 * Update usage from API response
 * Extracts rate limit headers from Anthropic API responses
 */
export function updateUsageFromResponse(response: {
    headers?: Headers
    usage?: {
        input_tokens: number
        output_tokens: number
    }
}): void {
    // Try to extract rate limit headers if available
    if (response.headers) {
        const limit = Number.parseInt(response.headers.get('anthropic-ratelimit-tokens-limit') || '0', 10)
        const remaining = Number.parseInt(response.headers.get('anthropic-ratelimit-tokens-remaining') || '0', 10)

        if (limit > 0 && remaining >= 0) {
            const used = limit - remaining
            tokenUsage.count = used
            tokenUsage.limit = limit
            tokenUsage.loading = false

            // Broadcast usage update
            if (wsManager) {
                wsManager.broadcast('/anthropic', {
                    type: 'usage:updated',
                    usage: {
                        count: tokenUsage.count,
                        limit: tokenUsage.limit,
                        loading: false,
                    },
                })
            }

            logger.debug(`[Token Usage] Updated from headers: ${tokenUsage.count}/${tokenUsage.limit} (${remaining} remaining)`)
        }
    }
}

/**
 * Get current token usage
 */
export function getTokenUsage(): TokenUsageState {
    return {...tokenUsage}
}
