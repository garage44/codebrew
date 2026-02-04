/**
 * Agents WebSocket API Routes
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {db} from '../lib/database.ts'
import {logger} from '../service.ts'
import {getAgentById} from '../lib/agent/index.ts'
import {randomId} from '@garage44/common/lib/utils'
import {getAgentStatus} from '../lib/agent/status.ts'
import {DEFAULT_AVATARS} from '../lib/agent/avatars.ts'
import {createTask} from '../lib/agent/tasks.ts'
import {getTokenUsage} from '../lib/agent/token-usage.ts'
import {config} from '../lib/config.ts'

export function registerAgentsWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Subscribe to agent task topic
    wsManager.api.post('/api/agents/:id/subscribe', async(ctx, req) => {
        const agentId = req.params.id
        const topic = `/agents/${agentId}/tasks`
        ctx.subscribe?.(topic)
        return {success: true, topic}
    })

    // Get all agents
    wsManager.api.get('/api/agents', async(_ctx, _req) => {
        const agents = db.prepare(`
            SELECT * FROM agents
            ORDER BY type, name
        `).all() as Array<{
            avatar: string | null
            config: string
            created_at: number
            display_name: string | null
            enabled: number
            id: string
            name: string
            status: string
            type: 'planner' | 'developer' | 'reviewer'
        }>

        // Enrich with status information
        const enrichedAgents = agents.map((agent) => {
            const status = getAgentStatus(agent.id)
            return {
                ...agent,
                avatar: agent.avatar || DEFAULT_AVATARS[agent.type],
                currentTicketId: status?.currentTicketId || null,
                display_name: agent.display_name || `${agent.name} Agent`,
                lastActivity: status?.lastActivity || agent.created_at,
                status: status?.status || (agent.status as 'idle' | 'working' | 'error' | 'offline') || 'idle',
            }
        })

        return {
            agents: enrichedAgents,
        }
    })

    // Get agent by ID
    wsManager.api.get('/api/agents/:id', async(_ctx, req) => {
        const agentId = req.params.id

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId)

        if (!agent) {
            throw new Error('Agent not found')
        }

        return {
            agent,
        }
    })

    // Register/create agent
    wsManager.api.post('/api/agents', async(ctx, req) => {
        const {config, enabled, name, type} = req.data as {
            config?: Record<string, unknown>
            enabled?: boolean
            name: string
            type: 'planner' | 'developer' | 'reviewer'
        }

        if (!name || !type) {
            throw new Error('name and type are required')
        }

        const agentId = randomId()
        const now = Date.now()

        const defaultAvatar = DEFAULT_AVATARS[type]
        const defaultDisplayName = `${name} Agent`

        db.prepare(`
            INSERT INTO agents (id, name, type, config, enabled, avatar, display_name, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            agentId,
            name,
            type,
            JSON.stringify(config || {}),
            enabled === false ? 0 : 1,
            defaultAvatar,
            defaultDisplayName,
            'idle',
            now,
        )

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId)

        // Broadcast agent creation
        wsManager.broadcast('/agents', {
            agent,
            type: 'agent:created',
        })

        logger.info(`[API] Registered agent ${agentId}: ${name} (${type})`)

        return {
            agent,
        }
    })

    // Trigger agent to process work (creates task instead of direct execution)
    wsManager.api.post('/api/agents/:id/trigger', async(ctx, req) => {
        const agentId = req.params.id
        const context = req.data as Record<string, unknown> || {}
        const stream = req.query?.stream === 'true'

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as {
            config: string
            enabled: number
            id: string
            name: string
            type: 'planner' | 'developer' | 'reviewer'
        } | undefined

        if (!agent) {
            throw new Error('Agent not found')
        }

        if (agent.enabled === 0) {
            throw new Error('Agent is disabled')
        }

        logger.info(`[API] Creating task for agent ${agent.name} (${agent.type})`)

        // Create task with low priority (manual triggers are less urgent than mentions)
        const taskId = createTask(
            agentId,
            'manual',
            {
                ...context,
                stream, // Include streaming flag in task data
            },
            0, // Low priority for manual triggers
        )

        // Broadcast task event to agent via WebSocket
        wsManager.emitEvent(`/agents/${agentId}/tasks`, {
            task_id: taskId,
            task_type: 'manual',
            task_data: {
                ...context,
                stream,
            },
        })

        logger.info(`[API] Created and broadcast task ${taskId} for agent ${agent.name}`)

        return {
            message: `Task created for agent ${agent.name}`,
            streaming: stream,
            success: true,
            task_id: taskId,
        }
    })

    // Update agent
    wsManager.api.put('/api/agents/:id', async(ctx, req) => {
        const agentId = req.params.id
        const updates = req.data as Partial<{
            config: Record<string, unknown>
            enabled: boolean
            name: string
        }>

        const fields: string[] = []
        const values: unknown[] = []

        if (updates.name !== undefined) {
            fields.push('name = ?')
            values.push(updates.name)
        }
        if (updates.config !== undefined) {
            fields.push('config = ?')
            values.push(JSON.stringify(updates.config))
        }
        if (updates.enabled !== undefined) {
            fields.push('enabled = ?')
            values.push(updates.enabled ? 1 : 0)
        }

        if (fields.length === 0) {
            throw new Error('No fields to update')
        }

        values.push(agentId)

        db.prepare(`
            UPDATE agents
            SET ${fields.join(', ')}
            WHERE id = ?
        `).run(...(values as Array<string | number>))

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId)

        // Broadcast agent update
        wsManager.broadcast('/agents', {
            agent,
            type: 'agent:updated',
        })

        return {
            agent,
        }
    })

    // Delete agent
    wsManager.api.delete('/api/agents/:id', async(_ctx, req) => {
        const agentId = req.params.id

        db.prepare('DELETE FROM agents WHERE id = ?').run(agentId)

        // Broadcast agent deletion
        wsManager.broadcast('/agents', {
            agentId,
            type: 'agent:deleted',
        })

        logger.info(`[API] Deleted agent ${agentId}`)

        return {
            success: true,
        }
    })

    // Subscribe to agent updates
    wsManager.on('/agents', (_ws) => {
        logger.debug('[API] Client subscribed to agent updates')
    })

    // Get Anthropic token usage
    wsManager.api.get('/api/anthropic/usage', async(_ctx, _req) => {
        const usage = getTokenUsage()
        logger.debug(`[API] Token usage requested: ${JSON.stringify(usage)}`)
        return {
            usage,
        }
    })

    // Test Anthropic API call to fetch usage
    wsManager.api.post('/api/anthropic/test', async(_ctx, _req) => {
        const apiKey = config.anthropic.apiKey || process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            throw new Error('Anthropic API key not configured')
        }

        logger.info('[API] Making test Anthropic API call to fetch usage headers')

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                body: JSON.stringify({
                    max_tokens: 10,
                    messages: [
                        {
                            content: 'Say "test"',
                            role: 'user',
                        },
                    ],
                    model: config.anthropic.model || 'claude-3-5-sonnet-20241022',
                }),
                headers: {
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                },
                method: 'POST',
            })

            logger.info(`[API] Test API call response status: ${response.status}`)

            // Log all headers
            const allHeaders: Record<string, string> = {}
            response.headers.forEach((value, key) => {
                allHeaders[key] = value
            })
            logger.info(`[API] All response headers: ${JSON.stringify(allHeaders, null, 2)}`)

            const limitHeader = response.headers.get('anthropic-ratelimit-tokens-limit')
            const remainingHeader = response.headers.get('anthropic-ratelimit-tokens-remaining')
            const resetHeader = response.headers.get('anthropic-ratelimit-tokens-reset')

            logger.info('[API] Rate limit headers:')
            logger.info(`  limit: ${limitHeader}`)
            logger.info(`  remaining: ${remainingHeader}`)
            logger.info(`  reset: ${resetHeader}`)

            if (!response.ok) {
                const error = await response.json().catch(() => ({error: {message: 'Unknown error'}}))
                throw new Error(error.error?.message || `API error: ${response.status}`)
            }

            const _data = await response.json()

            if (limitHeader && remainingHeader) {
                const {updateUsageFromHeaders} = await import('../lib/agent/token-usage.ts')
                updateUsageFromHeaders({
                    limit: parseInt(limitHeader, 10),
                    remaining: parseInt(remainingHeader, 10),
                    reset: resetHeader || undefined,
                })
            }

            return {
                headers: {
                    limit: limitHeader,
                    remaining: remainingHeader,
                    reset: resetHeader,
                },
                message: 'Test API call completed',
                success: true,
                usage: getTokenUsage(),
            }
        } catch(error) {
            logger.error(`[API] Test API call failed: ${error}`)
            throw error
        }
    })

    // Subscribe to Anthropic usage updates
    wsManager.on('/anthropic', (_ws) => {
        logger.debug('[API] Client subscribed to Anthropic usage updates')
    })
}
