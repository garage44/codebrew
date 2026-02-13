/**
 * GitLab API Adapter
 * Handles git operations via GitLab REST API
 */

import type {GitPlatform, MRStatus} from './base.ts'
import type {Repository} from '../database.ts'
import {logger} from '../../service.ts'
import {config} from '../config.ts'

export class GitLabAdapter implements GitPlatform {
    private apiKey: string

    private baseUrl: string

    constructor() {
        this.apiKey = config.git.gitlab.token || process.env.GITLAB_TOKEN || ''
        this.baseUrl = config.git.gitlab.url || 'https://gitlab.com'
    }

    isConfigured(): boolean {
        return Boolean(this.apiKey)
    }

    private async apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}/api/v4${endpoint}`
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'PRIVATE-TOKEN': this.apiKey,
                ...options.headers,
            },
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`GitLab API error: ${response.status} ${error}`)
        }

        return response
    }

    private parseRepoUrl(repo: Repository): {projectId: string} | null {
        if (!repo.remote_url) {
            return null
        }

        // Parse GitLab URL (https://gitlab.com/owner/repo.git or git@gitlab.com:owner/repo.git)
        const match = repo.remote_url.match(/gitlab\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) {
            // Try to extract project ID from URL-encoded format
            const encodedMatch = repo.remote_url.match(/projects%2F(\d+)/)
            if (encodedMatch) {
                return {projectId: encodedMatch[1]}
            }
            return null
        }

        /*
         * For GitLab, we need to find the project ID
         * For now, use owner/repo format
         */
        const projectPath = `${match[1]}/${match[2]}`
        return {projectId: encodeURIComponent(projectPath)}
    }

    async createBranch(repo: Repository, branchName: string): Promise<string> {
        const repoInfo = this.parseRepoUrl(repo)
        if (!repoInfo) {
            throw new Error('Invalid GitLab repository URL')
        }

        // Get default branch
        const repoResponse = await this.apiRequest(`/projects/${repoInfo.projectId}`)
        const repoData = await repoResponse.json() as {default_branch: string; id: number}
        const defaultBranch = repoData.default_branch

        // Get the commit SHA of the default branch
        const branchResponse = await this.apiRequest(`/projects/${repoInfo.projectId}/repository/branches/${defaultBranch}`)
        const branchData = await branchResponse.json() as {commit: {id: string}}
        const sha = branchData.commit.id

        // Create new branch
        await this.apiRequest(`/projects/${repoInfo.projectId}/repository/branches`, {
            body: JSON.stringify({
                branch: branchName,
                ref: sha,
            }),
            method: 'POST',
        })

        logger.info(`[GitLab] Created branch ${branchName}`)
        return branchName
    }

    async createMergeRequest(
        repo: Repository,
        branch: string,
        title: string,
        description: string,
    ): Promise<string> {
        const repoInfo = this.parseRepoUrl(repo)
        if (!repoInfo) {
            throw new Error('Invalid GitLab repository URL')
        }

        // Get default branch
        const repoResponse = await this.apiRequest(`/projects/${repoInfo.projectId}`)
        const repoData = await repoResponse.json() as {default_branch: string}
        const targetBranch = repoData.default_branch

        // Create merge request
        const mrResponse = await this.apiRequest(`/projects/${repoInfo.projectId}/merge_requests`, {
            body: JSON.stringify({
                description,
                source_branch: branch,
                target_branch: targetBranch,
                title,
            }),
            method: 'POST',
        })

        const mrData = await mrResponse.json() as {iid: number; web_url: string}
        logger.info(`[GitLab] Created MR !${mrData.iid}: ${mrData.web_url}`)
        return mrData.iid.toString()
    }

    async addComment(repo: Repository, mrId: string, comment: string): Promise<void> {
        const repoInfo = this.parseRepoUrl(repo)
        if (!repoInfo) {
            throw new Error('Invalid GitLab repository URL')
        }

        await this.apiRequest(`/projects/${repoInfo.projectId}/merge_requests/${mrId}/notes`, {
            body: JSON.stringify({
                body: comment,
            }),
            method: 'POST',
        })

        logger.info(`[GitLab] Added comment to MR !${mrId}`)
    }

    async getStatus(repo: Repository, branch: string): Promise<MRStatus | null> {
        const repoInfo = this.parseRepoUrl(repo)
        if (!repoInfo) {
            return null
        }

        // Find MR for this branch
        const mrsResponse = await this.apiRequest(`/projects/${repoInfo.projectId}/merge_requests?source_branch=${branch}&state=all`)
        const mrs = await mrsResponse.json() as {
            description: string
            iid: number
            state: 'opened' | 'closed' | 'merged'
            title: string
            web_url: string
        }[]

        if (mrs.length === 0) {
            return null
        }

        const mr = mrs[0]
        return {
            description: mr.description || '',
            id: mr.iid.toString(),
            state: mr.state === 'merged' ? 'merged' : (mr.state === 'opened' ? 'open' : 'closed'),
            title: mr.title,
            url: mr.web_url,
        }
    }
}
