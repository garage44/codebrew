/**
 * Agent factory and exports
 */

import {PlannerAgent} from './planner.ts'
import {DeveloperAgent} from './developer.ts'
import {ReviewerAgent} from './reviewer.ts'
import type {BaseAgent} from './base.ts'
import {db} from '../database.ts'

// Agent instances cache (by ID)
const agentInstances = new Map<string, BaseAgent>()

/**
 * Get agent instance by database ID
 * Creates instances and loads agent config from database
 */
export function getAgentById(agentId: string): BaseAgent | null {
    // Check cache first
    if (agentInstances.has(agentId)) {
        return agentInstances.get(agentId) || null
    }

    // Load agent from database
    const agentRecord = db.prepare(`
        SELECT id, name, type, config, enabled
        FROM agents
        WHERE id = ?
    `).get(agentId) as {
        config: string
        enabled: number
        id: string
        name: string
        type: 'planner' | 'developer' | 'reviewer'
    } | undefined

    if (!agentRecord) {
        return null
    }

    // Parse agent config
    let agentConfig = null as {skills?: string[]; tools?: string[]} | undefined
    try {
        if (agentRecord.config) {
            agentConfig = JSON.parse(agentRecord.config)
        }
    } catch {
        // Invalid JSON, use null
    }

    // Create agent instance based on type
    let agent: BaseAgent = null as unknown as BaseAgent
    switch (agentRecord.type) {
        case 'planner': {
            agent = new PlannerAgent(agentConfig)
            break
        }
        case 'developer': {
            agent = new DeveloperAgent(agentConfig)
            break
        }
        case 'reviewer': {
            agent = new ReviewerAgent(agentConfig)
            break
        }
        default: {
            return null
        }
    }

    // Cache instance
    agentInstances.set(agentId, agent)

    return agent
}

/**
 * Get agent instance by type (backward compatibility)
 * @deprecated Use getAgentById() instead
 */
export function getAgent(type: 'planner' | 'developer' | 'reviewer'): BaseAgent | null {
    // Find first agent of this type
    const agentRecord = db.prepare(`
        SELECT id
        FROM agents
        WHERE type = ? AND enabled = 1
        LIMIT 1
    `).get(type) as {id: string} | undefined

    if (!agentRecord) {
        return null
    }

    return getAgentById(agentRecord.id)
}

// Export agent classes
export {PlannerAgent} from './planner.ts'
export {DeveloperAgent} from './developer.ts'
export {ReviewerAgent} from './reviewer.ts'
export {BaseAgent} from './base.ts'
export type {AgentContext, AgentResponse} from './base.ts'
