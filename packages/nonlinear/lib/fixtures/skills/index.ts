/**
 * Skills registry loader
 * Loads skills from fixtures, configurable per agent
 */

import {logger} from '../../../service.ts'
import type {Skill} from './types.ts'
import {frontendSkill} from './frontend.ts'
import {backendSkill} from './backend.ts'
import {testingSkill} from './testing.ts'

// Export all skills
export const skills: Record<string, Skill> = {
    backend: backendSkill,
    frontend: frontendSkill,
    testing: testingSkill,
}

/**
 * Load skills based on agent configuration
 * If no config provided, loads all skills
 */
export function loadSkills(agentConfig?: {skills?: string[]}): Skill[] {
    if (!agentConfig?.skills || agentConfig.skills.length === 0) {
        // Load all skills
        return Object.values(skills)
    }

    // Load only specified skills
    const loaded: Skill[] = []
    for (const skillName of agentConfig.skills) {
        if (skills[skillName]) {
            loaded.push(skills[skillName])
        } else {
            logger.warn(`[Skills] Skill not found: ${skillName}`)
        }
    }
    return loaded
}

/**
 * Build system prompt from skills
 */
export function buildSkillSystemPrompt(skills: Skill[]): string {
    if (skills.length === 0) {
        return ''
    }

    const skillPrompts = skills.map((skill) => `
## ${skill.name.toUpperCase()} SKILL

${skill.systemPrompt}

Guidelines:
${skill.guidelines.map((g) => `- ${g}`).join('\n')}

Examples:
${skill.examples.map((e) => `- ${e}`).join('\n')}
`).join('\n')

    return `You have access to the following skills:

${skillPrompts}

Apply these skills appropriately when working on tasks.`
}
