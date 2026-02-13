/**
 * Local Git Adapter
 * Handles git operations on local repositories without remote PR/MR creation
 */

import type {GitPlatform, MRStatus} from './base.ts'
import type {Repository} from '../database.ts'
import {logger} from '../../service.ts'
import {$} from 'bun'

export class LocalGitAdapter implements GitPlatform {
    isConfigured(): boolean {
        // Local git is always available if git is installed
        return true
    }

    async createBranch(repo: Repository, branchName: string): Promise<string> {
        const originalCwd = process.cwd()
        try {
            process.chdir(repo.path)

            // Check if branch already exists
            const branchCheck = await $`git branch --list ${branchName}`.quiet()
            if (branchCheck.exitCode === 0 && branchCheck.stdout.toString().trim()) {
                logger.warn(`[LocalGit] Branch ${branchName} already exists`)
                return branchName
            }

            // Create and checkout new branch
            const result = await $`git checkout -b ${branchName}`.quiet()
            if (result.exitCode !== 0) {
                const error = result.stderr?.toString() || 'Unknown error'
                throw new Error(`Failed to create branch ${branchName}: ${error}`)
            }

            logger.info(`[LocalGit] Created branch ${branchName}`)
            return branchName
        } finally {
            process.chdir(originalCwd)
        }
    }

    async createMergeRequest(
        _repo: Repository,
        _branch: string,
        _title: string,
        _description: string,
    ): Promise<string> {
        /*
         * Local git doesn't support remote PR/MR creation
         * Return a placeholder ID
         */
        logger.info('[LocalGit] Merge request creation not supported for local repositories')
        return 'local-' + Date.now()
    }

    async addComment(_repo: Repository, _mrId: string, comment: string): Promise<void> {
        /*
         * Local git doesn't support comments
         * Log the comment instead
         */
        logger.info(`[LocalGit] Comment (not persisted): ${comment}`)
    }

    async getStatus(_repo: Repository, branch: string): Promise<MRStatus | null> {
        /*
         * Local git doesn't have MR status
         * Return a basic status indicating the branch exists
         */
        const originalCwd = process.cwd()
        try {
            process.chdir(_repo.path)
            const branchCheck = await $`git branch --list ${branch}`.quiet()
            if (branchCheck.exitCode === 0 && branchCheck.stdout.toString().trim()) {
                return {
                    description: 'Local branch (no remote MR)',
                    id: `local-${branch}`,
                    state: 'open',
                    title: branch,
                    url: '',
                }
            }
            return null
        } finally {
            process.chdir(originalCwd)
        }
    }
}
