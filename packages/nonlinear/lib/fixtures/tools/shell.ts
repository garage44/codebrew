/**
 * Shell operation tools using Bun Shell
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {$} from 'bun'
import path from 'node:path'

export const shellTools: Record<string, Tool> = {
    lint_code: {
        description: 'Run linter with optional auto-fix',
        execute: async(params: {
            fix?: boolean
            path?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const lintCmd = params.fix ?
                    $`bun run lint:ts --fix ${params.path || ''}` :
                    $`bun run lint:ts ${params.path || ''}`

                const result = await lintCmd
                    .cwd(context.repositoryPath)
                    .quiet()
                    .nothrow()

                return {
                    context: {
                        fixed: params.fix && result.exitCode === 0,
                    },
                    data: {
                        exitCode: result.exitCode,
                        output: result.stdout.toString(),
                    },
                    success: result.exitCode === 0,
                }
            } catch(error) {
                logger.error('[ShellTool] Failed to lint code:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'lint_code',
        parameters: [
            {
                description: 'Path to lint',
                name: 'path',
                required: false,
                type: 'string',
            },
            {
                description: 'Auto-fix linting errors',
                name: 'fix',
                required: false,
                type: 'boolean',
            },
        ],
    },

    run_command: {
        description: 'Execute shell command with Bun Shell',
        execute: async(params: {
            args?: string[]
            command: string
            cwd?: string
            env?: Record<string, string>
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const workDir = params.cwd ?
                        path.join(context.repositoryPath, params.cwd) :
                    context.repositoryPath

                /*
                 * Build command using Bun Shell template literal
                 * Bun Shell handles pipes, redirects, and shell operators natively
                 * Variables are automatically escaped (safe from injection)
                 */
                const args = params.args || []

                /*
                 * Construct command string - Bun Shell will parse it correctly
                 * (supports pipes, redirects, etc. natively)
                 */
                const cmdString = args.length > 0 ?
                    `${params.command} ${args.join(' ')}` :
                    params.command

                /*
                 * Use Bun Shell template literal - it handles shell operators natively
                 * The command string is parsed as shell syntax (pipes, redirects, etc.)
                 */
                const result = await $`${cmdString}`
                    .cwd(workDir)
                    .env(params.env || {})
                    .quiet()
                    .nothrow()

                return {
                    context: {
                        command: params.command,
                        cwd: params.cwd || context.repositoryPath,
                    },
                    data: {
                        exitCode: result.exitCode,
                        stderr: result.stderr.toString(),
                        stdout: result.stdout.toString(),
                    },
                    success: result.exitCode === 0,
                }
            } catch(error) {
                logger.error('[ShellTool] Failed to run command:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'run_command',
        parameters: [
            {
                description: 'Command to run',
                name: 'command',
                required: true,
                type: 'string',
            },
            {
                description: 'Command arguments',
                name: 'args',
                required: false,
                type: 'array',
            },
            {
                description: 'Working directory (relative to repository root)',
                name: 'cwd',
                required: false,
                type: 'string',
            },
            {
                description: 'Environment variables',
                name: 'env',
                required: false,
                type: 'object',
            },
        ],
    },

    run_tests: {
        description: 'Run test suite with Bun',
        execute: async(params: {
            filter?: string
            path?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const testCmd = params.filter ?
                    $`bun test ${params.path || '.'} --filter ${params.filter}` :
                    $`bun test ${params.path || '.'}`

                const result = await testCmd
                    .cwd(context.repositoryPath)
                    .quiet()
                    .nothrow()

                return {
                    context: {
                        filter: params.filter,
                        testPath: params.path,
                    },
                    data: {
                        exitCode: result.exitCode,
                        output: result.stdout.toString(),
                    },
                    success: result.exitCode === 0,
                }
            } catch(error) {
                logger.error('[ShellTool] Failed to run tests:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'run_tests',
        parameters: [
            {
                description: 'Test path or pattern',
                name: 'path',
                required: false,
                type: 'string',
            },
            {
                description: 'Test filter',
                name: 'filter',
                required: false,
                type: 'string',
            },
        ],
    },
}
