/**
 * Mention Parser
 * Extracts @agent-name and @human mentions from comment content
 */

import {db} from '../database.ts'

export interface ParsedMention {
    name: string
    original: string
    type: 'agent' | 'human'
}

/**
 * Parse mentions from comment content
 * Returns array of parsed mentions
 */
export function parseMentions(content: string): ParsedMention[] {
    const mentions: ParsedMention[] = []
    const mentionRegex = /@(\w+)/g
    let match: RegExpExecArray | null = null

    while ((match = mentionRegex.exec(content)) !== null) {
        const name = match[1]
        const original = match[0]

        // Check if it's an agent (case-insensitive match)
        const agent = db.prepare(`
            SELECT id, name, enabled
            FROM agents
            WHERE LOWER(name) = LOWER(?) OR LOWER(id) = LOWER(?)
        `).get(name, name) as {
            enabled: number
            id: string
            name: string
        } | undefined

        if (agent && agent.enabled === 1) {
            mentions.push({
                name: agent.name,
                original,
                type: 'agent',
            })
        } else {
            // Assume it's a human mention
            mentions.push({
                name,
                original,
                type: 'human',
            })
        }
    }

    return mentions
}

/**
 * Validate mentioned agents exist and are enabled
 */
export function validateMentions(mentions: ParsedMention[]): {
    invalid: ParsedMention[]
    valid: ParsedMention[]
} {
    const valid: ParsedMention[] = []
    const invalid: ParsedMention[] = []

    for (const mention of mentions) {
        if (mention.type === 'agent') {
            const agent = db.prepare(`
                SELECT id, name, enabled
                FROM agents
                WHERE LOWER(name) = LOWER(?) OR LOWER(id) = LOWER(?)
            `).get(mention.name, mention.name) as {
                enabled: number
                id: string
                name: string
            } | undefined

            if (agent && agent.enabled === 1) {
                valid.push(mention)
            } else {
                invalid.push(mention)
            }
        } else {
            // Human mentions are always valid
            valid.push(mention)
        }
    }

    return {invalid, valid}
}
