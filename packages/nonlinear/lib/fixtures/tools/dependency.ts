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
        name: 'analyze_dependencies',
        description: 'Analyze project dependencies and find where they are used. Use this to understand what packages are available and how they are imported.',
        parameters: [
            {
                name: 'packageName',
                type: 'string',
                description: 'Package to analyze (optional - if not provided, analyzes all dependencies)',
                required: false,
            },
            {
                name: 'findUsage',
                type: 'boolean',
                description: 'Find where package is imported/used in the codebase',
                required: false,
            },
        ],
        execute: async (params: {
            packageName?: string
            findUsage?: boolean
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const packageJsonPath = path.join(context.repositoryPath, 'package.json')
                const packageJsonContent = await Bun.file(packageJsonPath).text().catch(() => null)

                if (!packageJsonContent) {
                    return {
                        success: false,
                        error: 'package.json not found',
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
                            success: true,
                            data: {
                                package: params.packageName,
                                installed: false,
                                message: `Package "${params.packageName}" is not installed`,
                            },
                        }
                    }

                    const result: {
                        package: string
                        version: string
                        installed: boolean
                        usage?: Array<{file: string; line: number; import: string}>
                    } = {
                        package: params.packageName,
                        version,
                        installed: true,
                    }

                    // Find usage if requested
                    if (params.findUsage) {
                        const grepResult = await $`grep -rn "from ['\"]${params.packageName}" ${context.repositoryPath} --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" || true`
                            .cwd(context.repositoryPath)
                            .quiet()
                            .nothrow()
                            .text()

                        const usage: Array<{file: string; line: number; import: string}> = []
                        for (const line of grepResult.split('\n').filter(Boolean)) {
                            const match = line.match(/^([^:]+):(\d+):(.+)$/)
                            if (match) {
                                const [, file, lineNum, importLine] = match
                                usage.push({
                                    file: path.relative(context.repositoryPath, file),
                                    line: parseInt(lineNum, 10),
                                    import: importLine.trim(),
                                })
                            }
                        }

                        result.usage = usage.slice(0, 50) // Limit to 50 results
                    }

                    return {
                        success: true,
                        data: result,
                        context: {
                            totalUsageLocations: result.usage?.length || 0,
                        },
                    }
                }

                // Return all dependencies
                const dependencies = Object.entries(allDependencies).map(([name, version]) => ({
                    name,
                    version: version as string,
                    type: packageJson.dependencies?.[name] ? 'dependency' :
                        packageJson.devDependencies?.[name] ? 'devDependency' :
                        packageJson.peerDependencies?.[name] ? 'peerDependency' : 'unknown',
                }))

                return {
                    success: true,
                    data: {
                        dependencies,
                        total: dependencies.length,
                        packageJson: {
                            name: packageJson.name,
                            version: packageJson.version,
                        },
                    },
                    context: {
                        repositoryPath: context.repositoryPath,
                    },
                }
            } catch (error) {
                logger.error(`[DependencyTool] Failed to analyze dependencies:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
