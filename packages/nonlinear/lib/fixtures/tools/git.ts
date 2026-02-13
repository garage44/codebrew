/**
 * Git operation tools using git platform adapters
 */

import {$} from 'bun'

import type {Tool, ToolContext, ToolResult} from './types.ts'

import {logger} from '../../../service.ts'
import {getDb} from '../../database.ts'
import {createGitPlatform} from '../../git/index.ts'

export const gitTools: Record<string, Tool> = {
    analyze_git_history: {
        description:
            'Analyze git history to find similar past implementations or recent changes. Use this to learn from past work and understand recent changes.',
        execute: async (
            params: {
                file?: string
                limit?: number
                query?: string
                since?: string
            },
            context: ToolContext,
        ): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                const limit = params.limit || 10

                // Build git log command with all conditions
                const sinceDate = params.since ? parseSinceDate(params.since) : null

                // Construct command parts
                const cmdParts: (string | number)[] = [
                    'git',
                    'log',
                    '-n',
                    limit,
                    '--pretty=format:%H|%an|%ae|%ad|%s|%b',
                    '--date=iso',
                ]

                if (sinceDate) {
                    cmdParts.push('--since', sinceDate)
                }

                if (params.query) {
                    cmdParts.push('--grep', params.query, '--all-match')
                }

                if (params.file) {
                    cmdParts.push('--', params.file)
                }

                // Execute git log command
                const result =
                    await $`git log -n ${limit} --pretty=format:%H|%an|%ae|%ad|%s|%b --date=iso${sinceDate ? ` --since ${sinceDate}` : ''}${params.query ? ` --grep ${params.query} --all-match` : ''}${params.file ? ` -- ${params.file}` : ''}`
                        .cwd(context.repositoryPath)
                        .quiet()
                        .nothrow()
                        .text()

                const commits: {
                    author: string
                    body: string
                    date: string
                    email: string
                    files?: string[]
                    hash: string
                    subject: string
                }[] = []

                for (const line of result.split('\n').filter(Boolean)) {
                    const parts = line.split('|')
                    if (parts.length >= 5) {
                        const [hash, author, email, date, subject, ...bodyParts] = parts
                        const body = bodyParts.join('|').trim()

                        // Get files changed in this commit
                        let files: string[] = []
                        try {
                            const filesResult = await $`git show --name-only --pretty=format: ${hash}`
                                .cwd(context.repositoryPath)
                                .quiet()
                                .nothrow()
                                .text()
                            files = filesResult.split('\n').filter(Boolean).slice(1) // Skip first empty line
                        } catch {
                            // Ignore errors getting file list
                        }

                        commits.push({
                            author,
                            body: body.slice(0, 500),
                            date,
                            email,
                            files: files.slice(0, 20), // Limit to 20 files
                            hash: hash.slice(0, 8),
                            subject,
                        })
                    }
                }

                return {
                    context: {
                        file: params.file,
                        query: params.query,
                        since: params.since,
                        totalCommits: commits.length,
                    },
                    data: commits,
                    success: true,
                }
            } catch (error) {
                logger.error('[GitTool] Failed to analyze git history:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'analyze_git_history',
        parameters: [
            {
                description: 'File to analyze history for (relative path from repository root)',
                name: 'file',
                required: false,
                type: 'string',
            },
            {
                description: 'Search commit messages for similar work (e.g., "authentication", "file upload")',
                name: 'query',
                required: false,
                type: 'string',
            },
            {
                description: 'Time period (e.g., "1 week ago", "2024-01-01", "2 days ago")',
                name: 'since',
                required: false,
                type: 'string',
            },
            {
                description: 'Maximum number of commits to return (default: 10)',
                name: 'limit',
                required: false,
                type: 'number',
            },
        ],
    },

    git_branch: {
        description: 'Create a new git branch',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {branchName, repositoryId} = params as {branchName: string; repositoryId: string}
            try {
                const repo = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(repositoryId) as
                    | {
                          config: string
                          created_at: number
                          id: string
                          name: string
                          path: string
                          platform: 'github' | 'gitlab' | 'local'
                          remote_url: string | null
                          updated_at: number
                      }
                    | undefined

                if (!repo) {
                    return {
                        error: `Repository not found: ${repositoryId}`,
                        success: false,
                    }
                }

                const gitPlatform = createGitPlatform(repo)
                const branch = await gitPlatform.createBranch(repo, branchName)

                return {
                    context: {
                        branchName: branch,
                    },
                    data: {
                        branch,
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[GitTool] Failed to create branch:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'git_branch',
        parameters: [
            {
                description: 'Repository ID',
                name: 'repositoryId',
                required: true,
                type: 'string',
            },
            {
                description: 'Branch name',
                name: 'branchName',
                required: true,
                type: 'string',
            },
        ],
    },

    git_commit: {
        description: 'Commit changes to git',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {files, message, repositoryId} = params as {files?: string[]; message: string; repositoryId: string}
            try {
                const repo = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(repositoryId) as
                    | {
                          path: string
                      }
                    | undefined

                if (!repo) {
                    return {
                        error: `Repository not found: ${repositoryId}`,
                        success: false,
                    }
                }

                // Stage files if specified
                if (files && files.length > 0) {
                    await $`git add ${files}`.cwd(repo.path).quiet().nothrow()
                } else {
                    // Stage all changes
                    await $`git add -A`.cwd(repo.path).quiet().nothrow()
                }

                // Commit
                const result = await $`git commit -m ${message}`.cwd(repo.path).quiet().nothrow()

                if (result.exitCode !== 0) {
                    return {
                        error: result.stderr.toString() || 'Failed to commit',
                        success: false,
                    }
                }

                return {
                    context: {
                        filesAffected: files || [],
                    },
                    data: {
                        commitHash: result.stdout.toString().trim(),
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[GitTool] Failed to commit:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'git_commit',
        parameters: [
            {
                description: 'Repository ID',
                name: 'repositoryId',
                required: true,
                type: 'string',
            },
            {
                description: 'Commit message',
                name: 'message',
                required: true,
                type: 'string',
            },
            {
                description: 'Files to commit (empty for all staged files)',
                name: 'files',
                required: false,
                type: 'array',
            },
        ],
    },

    git_create_mr: {
        description: 'Create a merge request/pull request',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {branch, description, repositoryId, title} = params as {
                branch: string
                description?: string
                repositoryId: string
                title: string
            }
            try {
                const repo = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(repositoryId) as
                    | {
                          config: string
                          created_at: number
                          id: string
                          name: string
                          path: string
                          platform: 'github' | 'gitlab' | 'local'
                          remote_url: string | null
                          updated_at: number
                      }
                    | undefined

                if (!repo) {
                    return {
                        error: `Repository not found: ${repositoryId}`,
                        success: false,
                    }
                }

                const gitPlatform = createGitPlatform(repo)
                const mrId = await gitPlatform.createMergeRequest(repo, branch, title, description || '')

                return {
                    context: {
                        branchName: branch,
                    },
                    data: {
                        mrId,
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[GitTool] Failed to create MR:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'git_create_mr',
        parameters: [
            {
                description: 'Repository ID',
                name: 'repositoryId',
                required: true,
                type: 'string',
            },
            {
                description: 'Branch name',
                name: 'branch',
                required: true,
                type: 'string',
            },
            {
                description: 'MR/PR title',
                name: 'title',
                required: true,
                type: 'string',
            },
            {
                description: 'MR/PR description',
                name: 'description',
                required: false,
                type: 'string',
            },
        ],
    },

    git_status: {
        description: 'Get git status (modified files, untracked files, current branch)',
        execute: async (params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
            const {repositoryId} = params as {repositoryId: string}
            try {
                const repo = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(repositoryId) as
                    | {
                          path: string
                      }
                    | undefined

                if (!repo) {
                    return {
                        error: `Repository not found: ${repositoryId}`,
                        success: false,
                    }
                }

                // Get git status using Bun Shell
                const statusResult = await $`git status --porcelain`.cwd(repo.path).quiet().nothrow().text()

                const branchResult = await $`git branch --show-current`.cwd(repo.path).quiet().nothrow().text()

                const modifiedFiles: string[] = []
                const untrackedFiles: string[] = []
                const stagedFiles: string[] = []

                for (const line of statusResult.split('\n').filter(Boolean)) {
                    const status = line.slice(0, 2)
                    const file = line.slice(3)
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
                    context: {
                        filesAffected: [...modifiedFiles, ...untrackedFiles],
                    },
                    data: {
                        branch: branchResult.trim(),
                        modified: modifiedFiles,
                        staged: stagedFiles,
                        untracked: untrackedFiles,
                    },
                    success: true,
                }
            } catch (error) {
                logger.error('[GitTool] Failed to get git status:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'git_status',
        parameters: [
            {
                description: 'Repository ID',
                name: 'repositoryId',
                required: true,
                type: 'string',
            },
        ],
    },
}

/**
 * Parse "since" date string to git format
 */
function parseSinceDate(since: string): string | null {
    // Handle relative dates like "1 week ago", "2 days ago"
    const relativeMatch = since.match(/(\d+)\s*(day|week|month|year)s?\s*ago/i)
    if (relativeMatch) {
        const [, amount, unit] = relativeMatch
        const days =
            Number.parseInt(amount, 10) *
            (unit.toLowerCase() === 'day'
                ? 1
                : unit.toLowerCase() === 'week'
                  ? 7
                  : unit.toLowerCase() === 'month'
                    ? 30
                    : unit.toLowerCase() === 'year'
                      ? 365
                      : 1)
        const date = new Date()
        date.setDate(date.getDate() - days)
        return date.toISOString().split('T')[0]
    }

    // Handle ISO dates like "2024-01-01"
    if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
        return since
    }

    // Try to parse as date
    const parsed = new Date(since)
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0]
    }

    return null
}
