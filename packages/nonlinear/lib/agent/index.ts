/**
 * Agent factory and exports
 */

import {PrioritizerAgent} from './prioritizer.ts'
import {DeveloperAgent} from './developer.ts'
import {ReviewerAgent} from './reviewer.ts'
import type {BaseAgent} from './base.ts'
import {config} from '../config.ts'
import {db} from '../database.ts'

// Agent instances (singletons)
let prioritizerAgent: PrioritizerAgent | null = null
let developerAgent: DeveloperAgent | null = null
let reviewerAgent: ReviewerAgent | null = null

/**
 * Get agent instance by type
 * Creates singleton instances and loads agent config from database
 */
export function getAgent(type: 'prioritizer' | 'developer' | 'reviewer'): BaseAgent | null {
    switch (type) {
        case 'prioritizer':
            if (!prioritizerAgent) {
                // Try to get agent config from database
                const agentConfig = getAgentConfig('prioritizer')
                prioritizerAgent = new PrioritizerAgent(agentConfig)
            }
            return prioritizerAgent
        case 'developer':
            if (!developerAgent) {
                const agentConfig = getAgentConfig('developer')
                developerAgent = new DeveloperAgent(agentConfig)
            }
            return developerAgent
        case 'reviewer':
            if (!reviewerAgent) {
                const agentConfig = getAgentConfig('reviewer')
                reviewerAgent = new ReviewerAgent(agentConfig)
            }
            return reviewerAgent
    }
}

/**
 * Get agent configuration from database
 */
function getAgentConfig(type: 'prioritizer' | 'developer' | 'reviewer'): {skills?: string[]; tools?: string[]} | undefined {
    try {
        const agent = db.prepare('SELECT config FROM agents WHERE type = ? LIMIT 1').get(type) as {
            config: string
        } | undefined

        if (agent?.config) {
            try {
                return JSON.parse(agent.config)
            } catch {
                return undefined
            }
        }
    } catch {
        // Database might not be initialized or table doesn't exist
        return undefined
    }

    return undefined
}

// Export agent classes
export {PrioritizerAgent} from './prioritizer.ts'
export {DeveloperAgent} from './developer.ts'
export {ReviewerAgent} from './reviewer.ts'
export {BaseAgent} from './base.ts'
export type {AgentContext, AgentResponse} from './base.ts'
