/**
 * Agent State Tracking with Watched State Pattern
 * Tracks agent state properties and automatically broadcasts changes via WebSocket
 * Based on expressio's watched state pattern (ADR-031)
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {logger} from '../../service.ts'
import {getDb} from '../database.ts'
import {getAgentStatus} from './status.ts'
import {getTaskStats} from './tasks.ts'

export interface AgentState {
    lastHeartbeat?: number
    serviceOnline: boolean
    stats?: {
        completed: number
        failed: number
        pending: number
        processing: number
    }
    status?: 'idle' | 'working' | 'error' | 'offline'
    // Future: version, connectionQuality, capabilities, performance metrics
}

interface AgentStateData {
    [agentId: string]: AgentState
}

class AgentStateTracker {
    private wsManager?: WebSocketServerManager

    private _state: AgentStateData = {}

    private pendingChanges = false

    private batchUpdateInProgress = false

    private operationTimestamp = 0

    private operationTimeout: ReturnType<typeof setTimeout> | null = null

    private readonly OPERATION_GROUPING_TIME = 50

    private lastBroadcastTime = 0

    private readonly BROADCAST_THROTTLE_TIME = 2000

    /**
     * Create a deep proxy that watches for changes
     */
    private createDeepProxy<T extends Record<string, unknown>>(obj: T, onChange: () => void): T {
        return new Proxy(obj, {
            deleteProperty: (target, prop): boolean => {
                if (typeof prop === 'string' && prop in target && !this.batchUpdateInProgress) {
                    Reflect.deleteProperty(target, prop)
                    this.pendingChanges = true
                    this.trackOperation(onChange)
                }
                return true
            },
            get: (target, prop): unknown => {
                if (typeof prop === 'symbol') {
                    return target[prop as keyof typeof target]
                }
                const value = target[prop]
                // Only proxy objects, not primitive values
                if (value && typeof value === 'object' && !this.batchUpdateInProgress) {
                    return this.createDeepProxy(value as Record<string, unknown>, onChange) as T[Extract<keyof T, string>]
                }
                return value
            },
            set: (target, prop, value): boolean => {
                if (typeof prop === 'symbol') {
                    return true
                }
                const oldValue = target[prop as keyof typeof target]
                const targetRecord = target as Record<string, unknown>
                targetRecord[prop] = value

                // If this is a real change and not part of a batch update
                if (oldValue !== value && !this.batchUpdateInProgress) {
                    this.pendingChanges = true
                    this.trackOperation(onChange)
                }

                return true
            },
        })
    }

    /**
     * Track operations that happen close together as a single action
     */
    private trackOperation(onChange: () => void): void {
        if (this.batchUpdateInProgress) {
            return
        }

        const now = Date.now()

        if (this.operationTimeout) {
            clearTimeout(this.operationTimeout)
        }

        if (this.operationTimestamp === 0 || now - this.operationTimestamp > this.OPERATION_GROUPING_TIME) {
            // If we had pending changes from a previous operation, commit those first
            if (this.pendingChanges && this.operationTimestamp !== 0) {
                onChange()
            }

            // Start tracking a new operation
            this.operationTimestamp = now
        }

        // Schedule the completion of this operation after the grouping time
        this.operationTimeout = setTimeout((): void => {
            if (this.pendingChanges) {
                onChange()
                this.pendingChanges = false
            }
            this.operationTimestamp = 0
            this.operationTimeout = null
        }, this.OPERATION_GROUPING_TIME)
    }

    /**
     * Initialize agent state tracking
     */
    init(manager: WebSocketServerManager): void {
        this.wsManager = manager

        // Load all agents and initialize their state
        const agents = getDb().prepare('SELECT id FROM agents').all() as {id: string}[]
        for (const agent of agents) {
            // Check if agent service is already online by checking subscriptions
            const taskTopic = `/agents/${agent.id}/tasks`
            const subscribers = manager.subscriptions[taskTopic]
            let serviceOnline = false

            if (subscribers && subscribers.size > 0) {
                for (const ws of subscribers) {
                    if (ws.readyState === 1) {
                        serviceOnline = true
                        break
                    }
                }
            }

            this._state[agent.id] = {
                serviceOnline,
            }
        }

        // Wrap state in proxy to watch for changes
        this._state = this.createDeepProxy(this._state, (): void => {
            this.broadcastAgentState()
        })

        logger.info(`[Agent State] Initialized agent state tracking for ${agents.length} agents`)
    }

    /**
     * Get agent state
     */
    getState(agentId: string): AgentState | undefined {
        return this._state[agentId]
    }

    /**
     * Get all agent states
     */
    getAllStates(): AgentStateData {
        return this._state
    }

    /**
     * Update agent state (proxy will automatically trigger broadcast)
     */
    updateState(agentId: string, updates: Partial<AgentState>): void {
        if (!this._state[agentId]) {
            this._state[agentId] = {
                serviceOnline: false,
            }
        }

        Object.assign(this._state[agentId], updates)
    }

    /**
     * Set a specific state property (proxy will automatically trigger broadcast)
     */
    setState<K extends keyof AgentState>(agentId: string, key: K, value: AgentState[K]): void {
        // Ensure agent state exists (this will be proxied automatically)
        if (!this._state[agentId]) {
            // Create new state object - proxy will wrap it when accessed
            this._state[agentId] = {
                serviceOnline: false,
            }
        }

        const oldValue = this._state[agentId][key]

        // Direct assignment - proxy should detect this change
        this._state[agentId][key] = value

        logger.info(`[Agent State] Set ${agentId}.${String(key)} = ${value} (was ${oldValue})`)

        /*
         * Force immediate broadcast (proxy's trackOperation has delay)
         * This ensures state changes are propagated immediately
         */
        if (oldValue !== value && !this.batchUpdateInProgress) {
            this.broadcastAgentState()
        }
    }

    /**
     * Batch update multiple agents (prevents multiple broadcasts)
     */
    batchUpdate(updates: {agentId: string; updates: Partial<AgentState>}[]): void {
        this.batchUpdateInProgress = true

        for (const {agentId, updates: agentUpdates} of updates) {
            this.updateState(agentId, agentUpdates)
        }

        this.batchUpdateInProgress = false

        // Trigger single broadcast after batch update
        if (this.pendingChanges) {
            this.broadcastAgentState()
            this.pendingChanges = false
        }
    }

    /**
     * Broadcast agent state to all clients
     */
    broadcastAgentState(): void {
        if (!this.wsManager) {
            logger.warn('[Agent State] Cannot broadcast: wsManager not initialized')
            return
        }

        /* Create a clean copy of state enriched with status and stats */
        const cleanState: AgentStateData = {}
        for (const [agentId, state] of Object.entries(this._state) as [string, AgentState][]) {
            const agentStatus = getAgentStatus(agentId)
            const {serviceOnline} = state

            /*
             * Determine status - if service is offline, status should be 'offline'
             * Otherwise use the actual agent status (idle, working, error)
             */
            let status: 'idle' | 'working' | 'error' | 'offline' = (agentStatus?.status || 'idle') as
                | 'idle'
                | 'working'
                | 'error'
                | 'offline'
            if (!serviceOnline && status !== 'working') {
                status = 'offline'
            }

            cleanState[agentId] = {
                ...state,
                stats: getTaskStats(agentId),
                status,
            }
        }

        logger.info(`[Agent State] Broadcasting state for ${Object.keys(cleanState).length} agents`)

        /* Broadcast the state to all clients */
        this.wsManager.broadcast('/agents/state', {
            agents: cleanState,
            timestamp: Date.now(),
        })
    }

    /**
     * Throttled version to use for frequent operations
     */
    throttledBroadcastAgentState(): void {
        const now = Date.now()
        if (now - this.lastBroadcastTime < this.BROADCAST_THROTTLE_TIME) {
            return
        }
        this.lastBroadcastTime = now
        this.broadcastAgentState()
    }
}

// Singleton instance
let agentStateTracker: AgentStateTracker | null = null

/**
 * Initialize agent state tracking
 */
export function initAgentStateTracking(manager: WebSocketServerManager): void {
    agentStateTracker = new AgentStateTracker()
    agentStateTracker.init(manager)
}

/**
 * Get agent state
 */
export function getAgentState(agentId: string): AgentState | undefined {
    return agentStateTracker?.getState(agentId)
}

/**
 * Get all agent states
 */
export function getAllAgentStates(): AgentStateData {
    return agentStateTracker?.getAllStates() || {}
}

/**
 * Update agent state (automatically broadcasts)
 */
export function updateAgentState(agentId: string, updates: Partial<AgentState>): void {
    agentStateTracker?.updateState(agentId, updates)
}

/**
 * Set a specific state property (automatically broadcasts)
 */
export function setAgentState(agentId: string, key: keyof AgentState, value: AgentState[keyof AgentState]): void {
    agentStateTracker?.setState(agentId, key, value)
}

/**
 * Batch update multiple agents
 */
export function batchUpdateAgentStates(updates: {agentId: string; updates: Partial<AgentState>}[]): void {
    agentStateTracker?.batchUpdate(updates)
}
