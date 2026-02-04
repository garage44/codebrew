/**
 * Shell operation tools using Bun Shell
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {$} from 'bun'
import path from 'node:path'

export const shellTools: Record<string, Tool> = {
    run_command: {
        name: 'run_command',
        description: 'Execute shell command with Bun Shell',
        parameters: [
            {
                name: 'command',
                type: 'string',
                description: 'Command to run',
                required: true,
            },
            {
                name: 'args',
                type: 'array',
                description: 'Command arguments',
                required: false,
            },
            {
                name: 'cwd',
                type: 'string',
                description: 'Working directory (relative to repository root)',
                required: false,
            },
            {
                name: 'env',
                type: 'object',
                description: 'Environment variables',
                required: false,
            },
        ],
        execute: async (params: {
            command: string
            args?: string[]
            cwd?: string
            env?: Record<string, string>
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const workDir = params.cwd
                    ? path.join(context.repositoryPath, params.cwd)
                    : context.repositoryPath

                // Build command with args
                const cmdParts = [params.command, ...(params.args || [])]
                const result = await $(cmdParts)
                    .cwd(workDir)
                    .env(params.env || {})
                    .quiet()
                    .nothrow()

                return {
                    success: result.exitCode === 0,
                    data: {
                        stdout: result.stdout.toString(),
                        stderr: result.stderr.toString(),
                        exitCode: result.exitCode,
                    },
                    context: {
                        command: params.command,
                        cwd: params.cwd || context.repositoryPath,
                    },
                }
            } catch (error) {
                logger.error(`[ShellTool] Failed to run command:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    run_tests: {
        name: 'run_tests',
        description: 'Run test suite with Bun',
        parameters: [
            {
                name: 'path',
                type: 'string',
                description: 'Test path or pattern',
                required: false,
            },
            {
                name: 'filter',
                type: 'string',
                description: 'Test filter',
                required: false,
            },
        ],
        execute: async (params: {
            path?: string
            filter?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const testCmd = params.filter
                    ? $`bun test ${params.path || '.'} --filter ${params.filter}`
                    : $`bun test ${params.path || '.'}`

                const result = await testCmd
                    .cwd(context.repositoryPath)
                    .quiet()
                    .nothrow()

                return {
                    success: result.exitCode === 0,
                    data: {
                        output: result.stdout.toString(),
                        exitCode: result.exitCode,
                    },
                    context: {
                        testPath: params.path,
                        filter: params.filter,
                    },
                }
            } catch (error) {
                logger.error(`[ShellTool] Failed to run tests:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    lint_code: {
        name: 'lint_code',
        description: 'Run linter with optional auto-fix',
        parameters: [
            {
                name: 'path',
                type: 'string',
                description: 'Path to lint',
                required: false,
            },
            {
                name: 'fix',
                type: 'boolean',
                description: 'Auto-fix linting errors',
                required: false,
            },
        ],
        execute: async (params: {
            path?: string
            fix?: boolean
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const lintCmd = params.fix
                    ? $`bun run lint:ts --fix ${params.path || ''}`
                    : $`bun run lint:ts ${params.path || ''}`

                const result = await lintCmd
                    .cwd(context.repositoryPath)
                    .quiet()
                    .nothrow()

                return {
                    success: result.exitCode === 0,
                    data: {
                        output: result.stdout.toString(),
                        exitCode: result.exitCode,
                    },
                    context: {
                        fixed: params.fix && result.exitCode === 0,
                    },
                }
            } catch (error) {
                logger.error(`[ShellTool] Failed to lint code:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
