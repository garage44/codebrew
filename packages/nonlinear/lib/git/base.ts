/**
 * Abstract Git Platform Interface
 * All git platform adapters must implement this interface
 */

import type {Repository} from '../database.ts'

export interface MRStatus {
    description: string
    id: string
    state: 'open' | 'closed' | 'merged'
    title: string
    url: string
}

export interface GitPlatform {

    /**
     * Add a comment to a merge request
     */
    addComment(repo: Repository, mrId: string, comment: string): Promise<void>

    /**
     * Create a new branch in the repository
     */
    createBranch(repo: Repository, branchName: string): Promise<string>

    /**
     * Create a merge request/pull request
     */
    createMergeRequest(
        repo: Repository,
        branch: string,
        title: string,
        description: string,
    ): Promise<string>

    /**
     * Get the status of a merge request
     */
    getStatus(repo: Repository, branch: string): Promise<MRStatus | null>

    /**
     * Check if the platform is properly configured
     */
    isConfigured(): boolean
}
