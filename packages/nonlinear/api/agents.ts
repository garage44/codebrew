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
import {getTaskStats} from '../lib/agent/tasks.ts'
import {getAgentState, setAgentState, updateAgentState} from '../lib/agent/state.ts'
import path from 'path'
import {
    AgentDbSchema,
    AgentParamsSchema,
    AgentStatsResponseSchema,
    AgentServiceStatusResponseSchema,
    CreateAgentRequestSchema,
    EnrichedAgentSchema,
    StartAgentServiceResponseSchema,
    StopAgentServiceResponseSchema,
    TriggerAgentRequestSchema,
    TriggerAgentResponseSchema,
    UpdateAgentRequestSchema,
} from '../lib/schemas/agents.ts'
import {validateRequest} from '../lib/api/validate.ts'
import {z} from 'zod'

// Track PIDs of API-started agent services
const agentServicePids = new Map<string, number>()

/**
 * Start an agent service programmatically
 */
export async function startAgentService(agentId: string, wsManager: WebSocketServerManager): Promise<{
    message: string
    online: boolean
    pid?: number
    success: boolean
}> {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as {
        config: string
        enabled: number
        id: string
        name: string
        type: 'planner' | 'developer' | 'reviewer'
    } | undefined

    if (!agent) {
        return {
            message: 'Agent not found',
            online: false,
            success: false,
        }
    }

    if (agent.enabled === 0) {
        return {
            message: 'Agent is disabled',
            online: false,
            success: false,
        }
    }

    // Check if service is already running
    const taskTopic = `/agents/${agentId}/tasks`
    const subscribers = wsManager.subscriptions[taskTopic]
    if (subscribers && subscribers.size > 0) {
        return {
            message: 'Agent service is already running',
            online: true,
            success: true,
        }
    }

    // Check if we already started this service (avoid duplicates)
    if (agentServicePids.has(agentId)) {
        const pid = agentServicePids.get(agentId)!
        try {
            // Check if process is still running
            process.kill(pid, 0) // Signal 0 checks if process exists
            return {
                message: 'Agent service is already starting',
                online: false,
                success: true,
            }
        } catch {
            // Process doesn't exist, remove from map
            agentServicePids.delete(agentId)
        }
    }

    // Get WebSocket URL from agent config or use default
    let wsUrl = process.env.NONLINEAR_WS_URL || 'ws://localhost:3032/ws'
    try {
        const agentConfig = JSON.parse(agent.config || '{}') as Record<string, unknown>
        if (agentConfig.wsUrl && typeof agentConfig.wsUrl === 'string') {
            wsUrl = agentConfig.wsUrl
        } else if (agentConfig.websocket_url && typeof agentConfig.websocket_url === 'string') {
            wsUrl = agentConfig.websocket_url
        }
    } catch {
        // Invalid config, use default
    }

    // Spawn agent service process
    const serviceTsPath = path.join(process.cwd(), 'service.ts')
    const process_ = Bun.spawn(['bun', serviceTsPath, 'agent:service', '--agent-id', agentId], {
        cwd: process.cwd(),
        detached: true,
        stderr: 'pipe',
        stdout: 'pipe',
        env: {
            ...process.env,
            NONLINEAR_WS_URL: wsUrl,
        },
    })

    // Track PID
    agentServicePids.set(agentId, process_.pid)

    // Clean up PID when process exits
    process_.exited.then(() => {
        agentServicePids.delete(agentId)
        logger.debug(`[API] Agent service ${agentId} process exited (PID: ${process_.pid})`)
    }).catch(() => {
        agentServicePids.delete(agentId)
    })

    logger.info(`[API] Started agent service for ${agent.name} (${agent.type}) - PID: ${process_.pid}`)

    return {
        message: `Agent service started for ${agent.name}`,
        online: false, // Will be online once it connects
        pid: process_.pid,
        success: true,
    }
}

/**
 * Autostart agents based on config or command-line override
 */
export async function autostartAgents(
    wsManager: WebSocketServerManager,
    override?: boolean | string[],
): Promise<void> {
    // Command-line override takes precedence over config
    const autostartConfig = override !== undefined ? override : config.agents?.autostart

    // Skip if not configured (undefined or false)
    if (!autostartConfig || autostartConfig === false) {
        return
    }

    // Get all enabled agents
    const agents = db.prepare(`
        SELECT * FROM agents
        WHERE enabled = 1
        ORDER BY type, name
    `).all() as Array<{
        id: string
        name: string
        type: 'planner' | 'developer' | 'reviewer'
    }>

    if (agents.length === 0) {
        logger.info('[Autostart] No enabled agents found')
        return
    }

    // Determine which agents to start
    let agentsToStart: Array<{id: string; name: string}>
    if (autostartConfig === true) {
        // Start all enabled agents
        agentsToStart = agents.map((a) => ({id: a.id, name: a.name}))
        logger.info(`[Autostart] Starting all ${agentsToStart.length} enabled agents`)
    } else if (Array.isArray(autostartConfig)) {
        // Start only specified agent IDs
        agentsToStart = agents
            .filter((a) => autostartConfig.includes(a.id))
            .map((a) => ({id: a.id, name: a.name}))
        logger.info(`[Autostart] Starting ${agentsToStart.length} specified agents: ${agentsToStart.map((a) => a.name).join(', ')}`)
    } else {
        // Invalid config, skip
        logger.warn('[Autostart] Invalid autostart config, skipping')
        return
    }

    // Start agents with a small delay between each to avoid overwhelming the system
    for (const agent of agentsToStart) {
        try {
            const result = await startAgentService(agent.id, wsManager)
            if (result.success) {
                logger.info(`[Autostart] Started agent: ${agent.name} (${agent.id})`)
            } else {
                logger.warn(`[Autostart] Failed to start agent ${agent.name}: ${result.message}`)
            }
        } catch (error) {
            logger.error(`[Autostart] Error starting agent ${agent.name}: ${error}`)
        }

        // Small delay between starts
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
}

export function registerAgentsWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Subscribe to agent task topic
    wsManager.api.post('/api/agents/:id/subscribe', async(ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)
        const topic = `/agents/${params.id}/tasks`
        ctx.subscribe?.(topic)
        logger.info(`[API] Agent ${params.id} subscribed to topic ${topic}, connection readyState=${ctx.ws.readyState}`)

        // Verify subscription was added
        const subscribers = wsManager.subscriptions[topic]
        logger.info(`[API] Subscription verified: topic=${topic}, subscribers=${subscribers?.size || 0}`)

        // Update agent state - proxy will automatically broadcast
        setAgentState(params.id, 'serviceOnline', true)

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

        // Enrich with status information, stats, and service status
        const enrichedAgents = agents.map((agent) => {
            const validatedAgent = validateRequest(AgentDbSchema, {
                ...agent,
                status: agent.status as 'idle' | 'working' | 'error' | 'offline',
            })
            const status = getAgentStatus(agent.id)
            const stats = getTaskStats(agent.id)
            const agentState = getAgentState(agent.id)

            // Get service online status from watched state
            const serviceOnline = agentState?.serviceOnline ?? false

            // Determine agent status - if service is offline, status should be 'offline'
            // Otherwise use the actual agent status (idle, working, error)
            let agentStatus: 'idle' | 'working' | 'error' | 'offline' = (status?.status || validatedAgent.status || 'idle')

            // Override to 'offline' if service is not online (unless agent is actually working)
            if (!serviceOnline && agentStatus !== 'working') {
                agentStatus = 'offline'
            }

            return validateRequest(EnrichedAgentSchema, {
                ...validatedAgent,
                avatar: validatedAgent.avatar || DEFAULT_AVATARS[validatedAgent.type],
                currentTicketId: status?.currentTicketId || null,
                display_name: validatedAgent.display_name || `${validatedAgent.name} Agent`,
                lastActivity: status?.lastActivity || validatedAgent.created_at,
                serviceOnline,
                stats,
                status: agentStatus,
            })
        })

        return {
            agents: enrichedAgents,
        }
    })

    // Get agent by ID
    wsManager.api.get('/api/agents/:id', async(_ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as {
            avatar: string | null
            config: string
            created_at: number
            display_name: string | null
            enabled: number
            id: string
            name: string
            status: 'idle' | 'working' | 'error' | 'offline'
            type: 'planner' | 'developer' | 'reviewer'
        } | undefined

        if (!agent) {
            throw new Error('Agent not found')
        }

        const validatedAgent = validateRequest(AgentDbSchema, agent)

        return {
            agent: validatedAgent,
        }
    })

    // Register/create agent
    wsManager.api.post('/api/agents', async(ctx, req) => {
        const data = validateRequest(CreateAgentRequestSchema, req.data)

        const agentId = randomId()
        const now = Date.now()

        const defaultAvatar = DEFAULT_AVATARS[data.type]
        const defaultDisplayName = `${data.name} Agent`

        db.prepare(`
            INSERT INTO agents (id, name, type, config, enabled, avatar, display_name, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            agentId,
            data.name,
            data.type,
            JSON.stringify(data.config || {}),
            data.enabled === false ? 0 : 1,
            defaultAvatar,
            defaultDisplayName,
            'idle',
            now,
        )

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as {
            avatar: string | null
            config: string
            created_at: number
            display_name: string | null
            enabled: number
            id: string
            name: string
            status: 'idle' | 'working' | 'error' | 'offline'
            type: 'planner' | 'developer' | 'reviewer'
        } | undefined

        if (!agent) {
            throw new Error('Failed to create agent')
        }

        const validatedAgent = validateRequest(AgentDbSchema, agent)

        // Initialize agent state
        updateAgentState(agentId, {
            serviceOnline: false,
        })

        // Broadcast agent creation
        wsManager.broadcast('/agents', {
            agent: validatedAgent,
            type: 'agent:created',
        })

        logger.info(`[API] Registered agent ${agentId}: ${data.name} (${data.type})`)

        return {
            agent: validatedAgent,
        }
    })

    // Trigger agent to process work (creates task instead of direct execution)
    wsManager.api.post('/api/agents/:id/trigger', async(ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)
        const data = validateRequest(TriggerAgentRequestSchema, req.data)
        const stream = req.query?.stream === 'true' || data.stream === true

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as {
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

        // Extract context (all fields except stream)
        const {stream: _stream, ...context} = data

        // Create task with low priority (manual triggers are less urgent than mentions)
        const taskId = createTask(
            params.id,
            'manual',
            {
                ...context,
                stream, // Include streaming flag in task data
            },
            0, // Low priority for manual triggers
        )

        // Broadcast task event to agent via WebSocket
        wsManager.emitEvent(`/agents/${params.id}/tasks`, {
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
        const params = validateRequest(AgentParamsSchema, req.params)
        const updates = validateRequest(UpdateAgentRequestSchema, req.data)

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

        values.push(params.id)

        db.prepare(`
            UPDATE agents
            SET ${fields.join(', ')}
            WHERE id = ?
        `).run(...(values as Array<string | number>))

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id) as {
            avatar: string | null
            config: string
            created_at: number
            display_name: string | null
            enabled: number
            id: string
            name: string
            status: 'idle' | 'working' | 'error' | 'offline'
            type: 'planner' | 'developer' | 'reviewer'
        } | undefined

        if (!agent) {
            throw new Error('Agent not found')
        }

        const validatedAgent = validateRequest(AgentDbSchema, agent)

        // Broadcast agent update
        wsManager.broadcast('/agents', {
            agent: validatedAgent,
            type: 'agent:updated',
        })

        return {
            agent: validatedAgent,
        }
    })

    // Delete agent
    wsManager.api.delete('/api/agents/:id', async(_ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)

        db.prepare('DELETE FROM agents WHERE id = ?').run(params.id)

        // Broadcast agent deletion
        wsManager.broadcast('/agents', {
            agentId: params.id,
            type: 'agent:deleted',
        })

        logger.info(`[API] Deleted agent ${params.id}`)

        return {
            success: true,
        }
    })

    // Get agent task statistics
    wsManager.api.get('/api/agents/:id/stats', async(_ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)

        const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(params.id)
        if (!agent) {
            throw new Error('Agent not found')
        }

        const stats = getTaskStats(params.id)

        return {
            agentId: params.id,
            stats,
        }
    })

    // Get agent service status (online/offline)
    wsManager.api.get('/api/agents/:id/service-status', async(_ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)

        const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(params.id)
        if (!agent) {
            throw new Error('Agent not found')
        }

        // Check if agent service is connected by checking WebSocket subscriptions
        const taskTopic = `/agents/${params.id}/tasks`
        const subscribers = wsManager.subscriptions[taskTopic]

        // Check if any subscribed connections are still open
        let isOnline = false
        if (subscribers && subscribers.size > 0) {
            for (const ws of subscribers) {
                if (ws.readyState === 1) {
                    isOnline = true
                    break
                }
            }
        }

        // Fallback: check all connections for subscriptions to this topic
        if (!isOnline) {
            for (const ws of wsManager.connections) {
                if (ws.readyState === 1) {
                    const clientSubs = wsManager.clientSubscriptions.get(ws)
                    if (clientSubs && clientSubs.has(taskTopic)) {
                        isOnline = true
                        break
                    }
                }
            }
        }

        return {
            agentId: params.id,
            online: isOnline,
        }
    })

    // Start agent service
    wsManager.api.post('/api/agents/:id/service/start', async(_ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)
        return await startAgentService(params.id, wsManager)
    })

    // Stop agent service
    wsManager.api.post('/api/agents/:id/service/stop', async(_ctx, req) => {
        const params = validateRequest(AgentParamsSchema, req.params)

        const agent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(params.id) as {
            id: string
            name: string
        } | undefined

        if (!agent) {
            throw new Error('Agent not found')
        }

        // Check if service is online
        const taskTopic = `/agents/${params.id}/tasks`
        const subscribers = wsManager.subscriptions[taskTopic]
        const isOnline = subscribers && subscribers.size > 0

        if (!isOnline) {
            // Service is not online, but clean up PID if we have it
            if (agentServicePids.has(params.id)) {
                const pid = agentServicePids.get(params.id)!
                try {
                    // Try to kill the process if it exists
                    process.kill(pid, 'SIGTERM')
                } catch {
                    // Process doesn't exist or already dead
                }
                agentServicePids.delete(params.id)
            }

            return {
                message: 'Agent service is not running',
                online: false,
                success: true,
            }
        }

        // Send stop command via WebSocket broadcast
        // Use broadcast instead of emitEvent since agent services don't explicitly subscribe to stop topic
        // The agent service listens via onRoute which receives broadcast messages
        wsManager.broadcast(`/agents/${params.id}/stop`, {
            timestamp: Date.now(),
        })

        logger.info(`[API] Sent stop command to agent service ${agent.name} (${params.id})`)

        // Clean up PID if we have it
        if (agentServicePids.has(params.id)) {
            agentServicePids.delete(params.id)
        }

        return {
            message: `Stop command sent to agent service ${agent.name}`,
            online: true, // Will be offline once it disconnects
            success: true,
        }
    })

    // Subscribe to agent updates
    wsManager.on('/agents', (_ws) => {
        logger.debug('[API] Client subscribed to agent updates')
    })

    // Hook into connection close to detect when agent services go offline
    const originalClose = wsManager.close.bind(wsManager)
    wsManager.close = (ws: Parameters<typeof wsManager.close>[0]) => {
        // Check if this connection had any agent subscriptions
        const clientSubs = wsManager.clientSubscriptions.get(ws)
        if (clientSubs) {
            for (const topic of clientSubs) {
                // Check if this is an agent task topic
                const match = topic.match(/^\/agents\/([^/]+)\/tasks$/)
                if (match) {
                    const agentId = match[1]
                    // Update agent state - proxy will automatically broadcast
                    setAgentState(agentId, 'serviceOnline', false)
                    logger.info(`[API] Agent ${agentId} service went offline`)
                }
            }
        }
        // Call original close handler
        originalClose(ws)
    }

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
