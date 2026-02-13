/**
 * Dependency analysis tools
 * Analyze project dependencies and find where they're used
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {$} from 'bun'
import path from 'node:path'

export const dependencyTools: Record<string, Tool> = {
    analyze_dependencies: {
        description: 'Analyze project dependencies and find where they are used. Use this to understand what packages are available and how they are imported.',
        execute: async(params: {
            findUsage?: boolean
            packageName?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const packageJsonPath = path.join(context.repositoryPath, 'package.json')
                const packageJsonContent = await Bun.file(packageJsonPath).text().catch(() => null)

                if (!packageJsonContent) {
                    return {
                        error: 'package.json not found',
                        success: false,
                    }
                }

                const packageJson = JSON.parse(packageJsonContent)
                const allDependencies = {
                    ...packageJson.dependencies || {},
                    ...packageJson.devDependencies || {},
                    ...packageJson.peerDependencies || {},
                }

                // If specific package requested
                if (params.packageName) {
                    const version = allDependencies[params.packageName]
                    if (!version) {
                        return {
                            data: {
                                installed: false,
                                message: `Package "${params.packageName}" is not installed`,
                                package: params.packageName,
                            },
                            success: true,
                        }
                    }

                    const result: {
                        installed: boolean
                        package: string
                        usage?: Array<{file: string; import: string; line: number}>
                        version: string
                    } = {
                        installed: true,
                        package: params.packageName,
                        version,
                    }

                    // Find usage if requested
                    if (params.findUsage) {
                        const grepResult = await $`grep -rn "from ['\"]${params.packageName}" ${context.repositoryPath} --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" || true`
                            .cwd(context.repositoryPath)
                            .quiet()
                            .nothrow()
                            .text()

                        const usage: Array<{file: string; import: string; line: number}> = []
                        for (const line of grepResult.split('\n').filter(Boolean)) {
                            const match = line.match(/^([^:]+):(\d+):(.+)$/)
                            if (match) {
                                const [, file, lineNum, importLine] = match
                                usage.push({
                                    file: path.relative(context.repositoryPath, file),
                                    import: importLine.trim(),
                                    line: parseInt(lineNum, 10),
                                })
                            }
                        }

                        result.usage = usage.slice(0, 50) // Limit to 50 results
                    }

                    return {
                        context: {
                            totalUsageLocations: result.usage?.length || 0,
                        },
                        data: result,
                        success: true,
                    }
                }

                // Return all dependencies
                const dependencies = Object.entries(allDependencies).map(([name, version]) => ({
                    name,
                    type: packageJson.dependencies?.[name] ?
                        'dependency' :
                        packageJson.devDependencies?.[name] ?
                            'devDependency' :
                            packageJson.peerDependencies?.[name] ? 'peerDependency' : 'unknown',
                    version: version as string,
                }))

                return {
                    context: {
                        repositoryPath: context.repositoryPath,
                    },
                    data: {
                        dependencies,
                        packageJson: {
                            name: packageJson.name,
                            version: packageJson.version,
                        },
                        total: dependencies.length,
                    },
                    success: true,
                }
            } catch(error) {
                logger.error('[DependencyTool] Failed to analyze dependencies:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'analyze_dependencies',
        parameters: [
            {
                description: 'Package to analyze (optional - if not provided, analyzes all dependencies)',
                name: 'packageName',
                required: false,
                type: 'string',
            },
            {
                description: 'Find where package is imported/used in the codebase',
                name: 'findUsage',
                required: false,
                type: 'boolean',
            },
        ],
    },
}
