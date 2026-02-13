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
        description: 'Find TypeScript types, interfaces, and their usages. Use this to understand the type system and find reusable types.',
        execute: async(params: {
            findUsages?: boolean
            searchPattern?: string
            typeName?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                let searchPattern = ''
                if (params.typeName) {
                    // Exact match
                    searchPattern = `(?:type|interface|class|enum)\\s+${params.typeName}\\b`
                } else if (params.searchPattern) {
                    // Pattern match - convert wildcards to regex
                    const regexPattern = params.searchPattern
                        .replaceAll('*', '.*')
                        .replaceAll('?', '.')
                    searchPattern = `(?:type|interface|class|enum)\\s+${regexPattern}`
                } else {
                    return {
                        error: 'Either typeName or searchPattern must be provided',
                        success: false,
                    }
                }

                // Search for type definitions
                const grepResult = await $`grep -rnE "${searchPattern}" ${context.repositoryPath} --include="*.ts" --include="*.tsx" || true`
                    .cwd(context.repositoryPath)
                    .quiet()
                    .nothrow()
                    .text()

                const definitions: Array<{definition: string; file: string; line: number; type: 'type' | 'interface' | 'class' | 'enum'}> = []

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
                            definition: trimmed.slice(0, 200),
                            file: path.relative(context.repositoryPath, file),
                            line: parseInt(lineNum, 10),
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
                                usage: usageLine.trim().slice(0, 150),
                            })
                        }
                    }
                    usages = usages.slice(0, 50) // Limit to 50 results
                }

                return {
                    context: {
                        searchPattern: params.searchPattern,
                        totalDefinitions: definitions.length,
                        totalUsages: usages?.length || 0,
                        typeName: params.typeName,
                    },
                    data: {
                        definitions: definitions.slice(0, 20), // Limit to 20 definitions
                        usages: usages?.slice(0, 50),
                    },
                    success: true,
                }
            } catch(error) {
                logger.error('[TypeTool] Failed to find types:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'find_types',
        parameters: [
            {
                description: 'Type/interface name to find (exact match)',
                name: 'typeName',
                required: false,
                type: 'string',
            },
            {
                description: 'Search for types matching pattern (e.g., "User", "Config", "*Response")',
                name: 'searchPattern',
                required: false,
                type: 'string',
            },
            {
                description: 'Find where type is used/imported',
                name: 'findUsages',
                required: false,
                type: 'boolean',
            },
        ],
    },
}
