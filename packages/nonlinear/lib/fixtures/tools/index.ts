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
import {ticketTools} from './ticket.ts'
import {documentationTools} from './documentation.ts'
import {testTools} from './test.ts'
import {dependencyTools} from './dependency.ts'
import {typeTools} from './type.ts'

// Export all tools
export const tools: Record<string, Tool> = {
    ...fileTools,
    ...shellTools,
    ...codeTools,
    ...gitTools,
    ...ticketTools,
    ...documentationTools,
    ...testTools,
    ...dependencyTools,
    ...typeTools,
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
    description: string
    input_schema: {
        properties: Record<string, {description?: string; type: string}>
        required?: string[]
        type: 'object'
    }
    name: string
} {
    const properties: Record<string, {description?: string; type: string}> = {}
    const required: string[] = []

    for (const param of tool.parameters) {
        properties[param.name] = {
            description: param.description,
            type: param.type,
        }
        if (param.required) {
            required.push(param.name)
        }
    }

    return {
        description: tool.description,
        input_schema: {
            properties,
            required: required.length > 0 ? required : undefined,
            type: 'object',
        },
        name: tool.name,
    }
}
