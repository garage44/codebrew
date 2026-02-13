/**
 * Skills system types
 * Skills provide domain-specific knowledge and guidance to agents
 */

export interface Skill {
    description: string
    examples: string[]
    guidelines: string[]
    name: string
    systemPrompt: string
}
