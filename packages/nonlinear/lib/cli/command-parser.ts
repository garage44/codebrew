/**
 * Command parser for direct tool invocation in REPL
 * Allows testing tools without going through Anthropic
 */

import pc from 'picocolors'
import type {Tool, ToolContext, ToolResult} from '../fixtures/tools/types.ts'

/**
 * Parse command-line style arguments into a params object
 * Supports: --key=value, --key value, --flag (boolean)
 */
function parseArgs(args: string[]): Record<string, unknown> {
    const params: Record<string, unknown> = {}
    let idx = 0

    while (idx < args.length) {
        const arg = args[idx]

        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const equalsIndex = key.indexOf('=')

            if (equalsIndex !== -1) {
                // --key=value format
                const paramKey = key.slice(0, equalsIndex)
                const value = key.slice(equalsIndex + 1)
                params[paramKey] = parseValue(value)
            } else if (idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
                const paramKey = key
                const value = args[idx + 1]
                // --key value format
                params[paramKey] = parseValue(value)
                // Skip next arg as it's the value
                idx += 1
            } else {
                // --flag (boolean)
                params[key] = true
            }
        } else if (Object.keys(params).length === 0) {
            // Positional argument - treat as value for first parameter
            params.value = arg
        }

        idx += 1
    }

    return params
}

/**
 * Parse a string value to appropriate type
 */
function parseValue(value: string): unknown {
    // Try to parse as number
    if (/^-?\d+$/.test(value)) {
        return Number.parseInt(value, 10)
    }
    if (/^-?\d+\.\d+$/.test(value)) {
        return Number.parseFloat(value)
    }

    // Try to parse as boolean
    if (value === 'true') {
        return true
    }
    if (value === 'false') {
        return false
    }

    // Try to parse as JSON
    if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
        try {
            return JSON.parse(value)
        } catch {
            // Not valid JSON, return as string
        }
    }

    // Return as string
    return value
}

/**
 * Validate parameters against tool schema
 */
function validateParams(params: Record<string, unknown>, tool: Tool): {errors: string[]; valid: boolean} {
    const errors: string[] = []

    // Check required parameters
    for (const param of tool.parameters) {
        if (param.required && !(param.name in params) || params[param.name] === null) {
            errors.push(`Missing required parameter: ${param.name}`)
        }
    }

    // Check parameter types
    for (const [key, value] of Object.entries(params)) {
        const paramDef = tool.parameters.find((param): boolean => param.name === key)
        if (paramDef) {
            const expectedType = paramDef.type
            const actualType = typeof value

            // Type checking (loose - allow string numbers, etc.)
            if (expectedType === 'number' && typeof value !== 'number') {
                errors.push(`Parameter ${key} should be ${expectedType}, got ${actualType}`)
            } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
                errors.push(`Parameter ${key} should be ${expectedType}, got ${actualType}`)
            }
        } else {
            // Unknown parameter - warn but don't error
            // eslint-disable-next-line no-console
            console.warn(`⚠️  Unknown parameter: ${key}`)
        }
    }

    return {
        errors,
        valid: errors.length === 0,
    }
}

/**
 * Execute a tool directly from command string
 * Format: tool:tool_name --param1=value1 --param2=value2
 */
export async function executeToolCommand(
    command: string,
    tools: Record<string, Tool>,
    toolContext: ToolContext,
): Promise<ToolResult | null> {
    // Parse command format: tool:tool_name [args...]
    const match = command.match(/^tool:(\w+)(?:\s+(.+))?$/)
    // Not a tool command
    if (!match) {
        return null
    }

    const toolName = match[1]
    const argsString = match[2] || ''

    // Find tool
    const tool = tools[toolName]
    if (!tool) {
        return {
            error: `Tool not found: ${toolName}`,
            success: false,
        }
    }

    // Parse arguments
    const args = argsString.split(/\s+/).filter(Boolean)
    const params = parseArgs(args)

    // Validate parameters
    const validation = validateParams(params, tool)
    if (!validation.valid) {
        return {
            error: `Parameter validation failed:\n${validation.errors.join('\n')}`,
            success: false,
        }
    }

    // Execute tool
    try {
        const result = await tool.execute(params, toolContext)
        return result
    } catch(error: unknown) {
        return {
            error: error instanceof Error ? error.message : String(error),
            success: false,
        }
    }
}

/**
 * Get compact list of tools (names and descriptions only)
 */
export function getToolsList(tools: Record<string, Tool>): string {
    const toolNames = Object.keys(tools).toSorted()
    const lines: string[] = [pc.cyan('\nAvailable Tools:\n')]

    // Group tools by category (prefix before underscore)
    const categories: Record<string, {name: string; tool: Tool}[]> = {}
    for (const toolName of toolNames) {
        const tool = tools[toolName]
        const category = toolName.includes('_') ? toolName.split('_')[0] : 'other'
        if (!categories[category]) {
            categories[category] = []
        }
        categories[category].push({name: toolName, tool})
    }

    // Display by category
    for (const [category, toolList] of Object.entries(categories).toSorted()) {
        if (category !== 'other') {
            lines.push(pc.gray(`  ${category}:`))
        }
        for (const {name, tool} of toolList) {
            const nameColor = pc.bold(pc.cyan(name))
            const descColor = pc.gray(tool.description)
            lines.push(`    ${nameColor} - ${descColor}`)
        }
        lines.push('')
    }

    lines.push(pc.gray('Use "tools --help" for detailed parameter information\n'))

    return lines.join('\n')
}

/**
 * Get help text for all available tools
 */
export function getToolsHelp(tools: Record<string, Tool>): string {
    const toolNames = Object.keys(tools).toSorted()
    const helpLines: string[] = [pc.cyan('\nAvailable Tools:\n')]

    for (const toolName of toolNames) {
        const tool = tools[toolName]
        helpLines.push(`  ${pc.bold(pc.cyan(toolName))}`)
        helpLines.push(`    ${pc.gray(tool.description)}`)

        if (tool.parameters.length > 0) {
            helpLines.push('    Parameters:')
            for (const param of tool.parameters) {
                const required = param.required ? pc.red('(required)') : pc.gray('(optional)')
                helpLines.push(`      ${pc.yellow(`--${param.name}`)} ${pc.gray(`(${param.type})`)} ${required}`)
                if (param.description) {
                    helpLines.push(`        ${pc.gray(param.description)}`)
                }
            }
        }

        helpLines.push('')
    }

    helpLines.push(pc.gray('Usage: tool:tool_name --param1=value1 --param2=value2'))
    helpLines.push(pc.gray('Example: tool:list_tickets --status=todo --limit=10\n'))

    return helpLines.join('\n')
}
