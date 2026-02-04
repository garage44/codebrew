/**
 * Git operation tools using git platform adapters
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {createGitPlatform} from '../../git/index.ts'
import {db} from '../../database.ts'
import {$} from 'bun'

export const gitTools: Record<string, Tool> = {
    git_status: {
        name: 'git_status',
        description: 'Get git status (modified files, untracked files, current branch)',
        parameters: [
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Repository ID',
                required: true,
            },
        ],
        execute: async (params: {
            repositoryId: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(params.repositoryId) as {
                    path: string
                } | undefined

                if (!repo) {
                    return {
                        success: false,
                        error: `Repository not found: ${params.repositoryId}`,
                    }
                }

                // Get git status using Bun Shell
                const statusResult = await $`git status --porcelain`
                    .cwd(repo.path)
                    .quiet()
                    .nothrow()
                    .text()

                const branchResult = await $`git branch --show-current`
                    .cwd(repo.path)
                    .quiet()
                    .nothrow()
                    .text()

                const modifiedFiles: string[] = []
                const untrackedFiles: string[] = []
                const stagedFiles: string[] = []

                for (const line of statusResult.split('\n').filter(Boolean)) {
                    const status = line.substring(0, 2)
                    const file = line.substring(3)
                    if (status.startsWith('??')) {
                        untrackedFiles.push(file)
                    } else if (status.startsWith('M') || status.startsWith('A') || status.startsWith('D')) {
                        if (status[0] !== ' ' && status[0] !== '?') {
                            stagedFiles.push(file)
                        }
                        if (status[1] === 'M' || status[1] === 'D') {
                            modifiedFiles.push(file)
                        }
                    }
                }

                return {
                    success: true,
                    data: {
                        branch: branchResult.trim(),
                        modified: modifiedFiles,
                        untracked: untrackedFiles,
                        staged: stagedFiles,
                    },
                    context: {
                        filesAffected: [...modifiedFiles, ...untrackedFiles],
                    },
                }
            } catch (error) {
                logger.error(`[GitTool] Failed to get git status:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    git_branch: {
        name: 'git_branch',
        description: 'Create a new git branch',
        parameters: [
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Repository ID',
                required: true,
            },
            {
                name: 'branchName',
                type: 'string',
                description: 'Branch name',
                required: true,
            },
        ],
        execute: async (params: {
            repositoryId: string
            branchName: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(params.repositoryId) as {
                    path: string
                    platform: 'github' | 'gitlab' | 'local'
                } | undefined

                if (!repo) {
                    return {
                        success: false,
                        error: `Repository not found: ${params.repositoryId}`,
                    }
                }

                const gitPlatform = createGitPlatform(repo)
                const branch = await gitPlatform.createBranch(repo, params.branchName)

                return {
                    success: true,
                    data: {
                        branch,
                    },
                    context: {
                        branchName: branch,
                    },
                }
            } catch (error) {
                logger.error(`[GitTool] Failed to create branch:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    git_commit: {
        name: 'git_commit',
        description: 'Commit changes to git',
        parameters: [
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Repository ID',
                required: true,
            },
            {
                name: 'message',
                type: 'string',
                description: 'Commit message',
                required: true,
            },
            {
                name: 'files',
                type: 'array',
                description: 'Files to commit (empty for all staged files)',
                required: false,
            },
        ],
        execute: async (params: {
            repositoryId: string
            message: string
            files?: string[]
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(params.repositoryId) as {
                    path: string
                } | undefined

                if (!repo) {
                    return {
                        success: false,
                        error: `Repository not found: ${params.repositoryId}`,
                    }
                }

                // Stage files if specified
                if (params.files && params.files.length > 0) {
                    await $`git add ${params.files}`
                        .cwd(repo.path)
                        .quiet()
                        .nothrow()
                } else {
                    // Stage all changes
                    await $`git add -A`
                        .cwd(repo.path)
                        .quiet()
                        .nothrow()
                }

                // Commit
                const result = await $`git commit -m ${params.message}`
                    .cwd(repo.path)
                    .quiet()
                    .nothrow()

                if (result.exitCode !== 0) {
                    return {
                        success: false,
                        error: result.stderr.toString() || 'Failed to commit',
                    }
                }

                return {
                    success: true,
                    data: {
                        commitHash: result.stdout.toString().trim(),
                    },
                    context: {
                        filesAffected: params.files || [],
                    },
                }
            } catch (error) {
                logger.error(`[GitTool] Failed to commit:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },

    git_create_mr: {
        name: 'git_create_mr',
        description: 'Create a merge request/pull request',
        parameters: [
            {
                name: 'repositoryId',
                type: 'string',
                description: 'Repository ID',
                required: true,
            },
            {
                name: 'branch',
                type: 'string',
                description: 'Branch name',
                required: true,
            },
            {
                name: 'title',
                type: 'string',
                description: 'MR/PR title',
                required: true,
            },
            {
                name: 'description',
                type: 'string',
                description: 'MR/PR description',
                required: false,
            },
        ],
        execute: async (params: {
            repositoryId: string
            branch: string
            title: string
            description?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(params.repositoryId) as {
                    path: string
                    platform: 'github' | 'gitlab' | 'local'
                } | undefined

                if (!repo) {
                    return {
                        success: false,
                        error: `Repository not found: ${params.repositoryId}`,
                    }
                }

                const gitPlatform = createGitPlatform(repo)
                const mrId = await gitPlatform.createMergeRequest(
                    repo,
                    params.branch,
                    params.title,
                    params.description || ''
                )

                return {
                    success: true,
                    data: {
                        mrId,
                    },
                    context: {
                        branchName: params.branch,
                    },
                }
            } catch (error) {
                logger.error(`[GitTool] Failed to create MR:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
