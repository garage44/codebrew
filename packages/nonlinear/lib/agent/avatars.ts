/**
 * Agent Avatar System
 * Manages agent avatars using the same system as users
 */

import {db} from '../database.ts'
import {logger} from '../../service.ts'

/**
 * Default avatar assignments for agent types
 */
export const DEFAULT_AVATARS: Record<'planner' | 'developer' | 'reviewer', string> = {
    developer: 'placeholder-3.png',
    planner: 'placeholder-2.png',
    reviewer: 'placeholder-4.png',
}

/**
 * Initialize agent avatars
 * Assigns default avatars to agents that don't have one
 */
export function initAgentAvatars() {
    const agents = db.prepare(`
        SELECT id, name, type, avatar, display_name
        FROM agents
    `).all() as Array<{
        avatar: string | null
        display_name: string | null
        id: string
        name: string
        type: 'planner' | 'developer' | 'reviewer'
    }>

    for (const agent of agents) {
        let needsUpdate = false
        let avatar = agent.avatar
        let displayName = agent.display_name

        // Assign default avatar if missing
        if (!avatar) {
            avatar = DEFAULT_AVATARS[agent.type]
            needsUpdate = true
        }

        // Assign default display name if missing
        if (!displayName) {
            displayName = `${agent.name} Agent`
            needsUpdate = true
        }

        if (needsUpdate) {
            db.prepare(`
                UPDATE agents
                SET avatar = ?, display_name = ?
                WHERE id = ?
            `).run(avatar, displayName, agent.id)

            logger.info(`[Agent Avatars] Assigned avatar ${avatar} to agent ${agent.name}`)
        }
    }

    logger.info('[Agent Avatars] Initialized agent avatars')
}

/**
 * Get avatar for an agent
 */
export function getAgentAvatar(agentId: string): string | null {
    const agent = db.prepare('SELECT avatar FROM agents WHERE id = ?').get(agentId) as {avatar: string | null} | undefined
    return agent?.avatar || null
}

/**
 * Set avatar for an agent
 */
export function setAgentAvatar(agentId: string, avatar: string) {
    db.prepare(`
        UPDATE agents
        SET avatar = ?
        WHERE id = ?
    `).run(avatar, agentId)

    logger.info(`[Agent Avatars] Set avatar ${avatar} for agent ${agentId}`)
}
