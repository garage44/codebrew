/**
 * Type discovery tools
 * Find TypeScript types, interfaces, and their usages
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {$} from 'bun'
import path from 'node:path'

export const typeTools: Record<string, Tool> = {
    find_types: {
        name: 'find_types',
        description: 'Find TypeScript types, interfaces, and their usages. Use this to understand the type system and find reusable types.',
        parameters: [
            {
                name: 'typeName',
                type: 'string',
                description: 'Type/interface name to find (exact match)',
                required: false,
            },
            {
                name: 'searchPattern',
                type: 'string',
                description: 'Search for types matching pattern (e.g., "User", "Config", "*Response")',
                required: false,
            },
            {
                name: 'findUsages',
                type: 'boolean',
                description: 'Find where type is used/imported',
                required: false,
            },
        ],
        execute: async (params: {
            typeName?: string
            searchPattern?: string
            findUsages?: boolean
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                let searchPattern = ''
                if (params.typeName) {
                    // Exact match
                    searchPattern = `(?:type|interface|class|enum)\\s+${params.typeName}\\b`
                } else if (params.searchPattern) {
                    // Pattern match - convert wildcards to regex
                    const regexPattern = params.searchPattern
                        .replace(/\*/g, '.*')
                        .replace(/\?/g, '.')
                    searchPattern = `(?:type|interface|class|enum)\\s+${regexPattern}`
                } else {
                    return {
                        success: false,
                        error: 'Either typeName or searchPattern must be provided',
                    }
                }

                // Search for type definitions
                const grepResult = await $`grep -rnE "${searchPattern}" ${context.repositoryPath} --include="*.ts" --include="*.tsx" || true`
                    .cwd(context.repositoryPath)
                    .quiet()
                    .nothrow()
                    .text()

                const definitions: Array<{file: string; line: number; definition: string; type: 'type' | 'interface' | 'class' | 'enum'}> = []

                for (const line of grepResult.split('\n').filter(Boolean)) {
                    const match = line.match(/^([^:]+):(\d+):(.+)$/)
                    if (match) {
                        const [, file, lineNum, definitionLine] = match
                        const trimmed = definitionLine.trim()

                        let type: 'type' | 'interface' | 'class' | 'enum' = 'type'
                        if (trimmed.startsWith('interface ')) type = 'interface'
                        else if (trimmed.startsWith('class ')) type = 'class'
                        else if (trimmed.startsWith('enum ')) type = 'enum'

                        definitions.push({
                            file: path.relative(context.repositoryPath, file),
                            line: parseInt(lineNum, 10),
                            definition: trimmed.substring(0, 200),
                            type,
                        })
                    }
                }

                // Find usages if requested
                let usages: Array<{file: string; line: number; usage: string}> | undefined
                if (params.findUsages && params.typeName) {
                    // Search for imports and usage of the type
                    const usagePattern = `(?:import.*${params.typeName}|:\\s*${params.typeName}|<${params.typeName}|${params.typeName}\\[|${params.typeName}\\s*[,)])`
                    const usageResult = await $`grep -rnE "${usagePattern}" ${context.repositoryPath} --include="*.ts" --include="*.tsx" || true`
                        .cwd(context.repositoryPath)
                        .quiet()
                        .nothrow()
                        .text()

                    usages = []
                    for (const line of usageResult.split('\n').filter(Boolean)) {
                        const match = line.match(/^([^:]+):(\d+):(.+)$/)
                        if (match) {
                            const [, file, lineNum, usageLine] = match
                            usages.push({
                                file: path.relative(context.repositoryPath, file),
                                line: parseInt(lineNum, 10),
                                usage: usageLine.trim().substring(0, 150),
                            })
                        }
                    }
                    usages = usages.slice(0, 50) // Limit to 50 results
                }

                return {
                    success: true,
                    data: {
                        definitions: definitions.slice(0, 20), // Limit to 20 definitions
                        usages: usages?.slice(0, 50),
                    },
                    context: {
                        totalDefinitions: definitions.length,
                        totalUsages: usages?.length || 0,
                        typeName: params.typeName,
                        searchPattern: params.searchPattern,
                    },
                }
            } catch (error) {
                logger.error(`[TypeTool] Failed to find types:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
