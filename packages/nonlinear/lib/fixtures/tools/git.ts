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

    analyze_git_history: {
        name: 'analyze_git_history',
        description: 'Analyze git history to find similar past implementations or recent changes. Use this to learn from past work and understand recent changes.',
        parameters: [
            {
                name: 'file',
                type: 'string',
                description: 'File to analyze history for (relative path from repository root)',
                required: false,
            },
            {
                name: 'query',
                type: 'string',
                description: 'Search commit messages for similar work (e.g., "authentication", "file upload")',
                required: false,
            },
            {
                name: 'since',
                type: 'string',
                description: 'Time period (e.g., "1 week ago", "2024-01-01", "2 days ago")',
                required: false,
            },
            {
                name: 'limit',
                type: 'number',
                description: 'Maximum number of commits to return (default: 10)',
                required: false,
            },
        ],
        execute: async (params: {
            file?: string
            query?: string
            since?: string
            limit?: number
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                const limit = params.limit || 10

                // Build git log command with all conditions
                const sinceDate = params.since ? parseSinceDate(params.since) : null

                // Construct command parts
                const cmdParts: Array<string | number> = ['git', 'log', '-n', limit, '--pretty=format:%H|%an|%ae|%ad|%s|%b', '--date=iso']

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
                const result = await $`git log -n ${limit} --pretty=format:%H|%an|%ae|%ad|%s|%b --date=iso${sinceDate ? ` --since ${sinceDate}` : ''}${params.query ? ` --grep ${params.query} --all-match` : ''}${params.file ? ` -- ${params.file}` : ''}`
                    .cwd(context.repositoryPath)
                    .quiet()
                    .nothrow()
                    .text()

                const commits: Array<{
                    hash: string
                    author: string
                    email: string
                    date: string
                    subject: string
                    body: string
                    files?: string[]
                }> = []

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
                            hash: hash.substring(0, 8),
                            author,
                            email,
                            date,
                            subject,
                            body: body.substring(0, 500),
                            files: files.slice(0, 20), // Limit to 20 files
                        })
                    }
                }

                return {
                    success: true,
                    data: commits,
                    context: {
                        totalCommits: commits.length,
                        file: params.file,
                        query: params.query,
                        since: params.since,
                    },
                }
            } catch (error) {
                logger.error(`[GitTool] Failed to analyze git history:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
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
        const days = parseInt(amount, 10) * (
            unit.toLowerCase() === 'day' ? 1 :
            unit.toLowerCase() === 'week' ? 7 :
            unit.toLowerCase() === 'month' ? 30 :
            unit.toLowerCase() === 'year' ? 365 : 1
        )
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
