/**
 * Tool registry loader
 * Loads tools from fixtures, configurable per agent
 */

import {logger} from '../../../service.ts'
import type {Tool} from './types.ts'
import {fileTools} from './file.ts'
import {shellTools} from './shell.ts'
import {codeTools} from './code.ts'
import {gitTools} from './git.ts'

// Export all tools
export const tools: Record<string, Tool> = {
    ...fileTools,
    ...shellTools,
    ...codeTools,
    ...gitTools,
}

/**
 * Load tools based on agent configuration
 * If no config provided, loads all tools
 */
export function loadTools(agentConfig?: {tools?: string[]}): Record<string, Tool> {
    if (!agentConfig?.tools || agentConfig.tools.length === 0) {
        return tools // Load all tools
    }

    // Load only specified tools
    const loaded: Record<string, Tool> = {}
    for (const toolName of agentConfig.tools) {
        if (tools[toolName]) {
            loaded[toolName] = tools[toolName]
        } else {
            logger.warn(`[Tools] Tool not found: ${toolName}`)
        }
    }
    return loaded
}

/**
 * Convert Tool interface to Anthropic tool format
 */
export function toolToAnthropic(tool: Tool): {
    name: string
    description: string
    input_schema: {
        type: 'object'
        properties: Record<string, {type: string; description?: string}>
        required?: string[]
    }
} {
    const properties: Record<string, {type: string; description?: string}> = {}
    const required: string[] = []

    for (const param of tool.parameters) {
        properties[param.name] = {
            type: param.type,
            description: param.description,
        }
        if (param.required) {
            required.push(param.name)
        }
    }

    return {
        name: tool.name,
        description: tool.description,
        input_schema: {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
        },
    }
}
