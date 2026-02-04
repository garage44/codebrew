/**
 * Skills system types
 * Skills provide domain-specific knowledge and guidance to agents
 */

export interface Skill {
    name: string
    description: string
    systemPrompt: string
    guidelines: string[]
    examples: string[]
}
