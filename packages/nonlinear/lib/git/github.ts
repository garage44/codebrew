/**
 * GitHub API Adapter
 * Handles git operations via GitHub REST API
 */

import type {GitPlatform, MRStatus} from './base.ts'
import type {Repository} from '../database.ts'
import {logger} from '../../service.ts'
import {config} from '../config.ts'
import {$} from 'bun'

export class GitHubAdapter implements GitPlatform {
    private apiKey: string

    constructor() {
        this.apiKey = config.git.github.token || process.env.GITHUB_TOKEN || ''
    }

    isConfigured(): boolean {
        return !!this.apiKey
    }

    private async apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
        const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`
        const response = await fetch(url, {
            ...options,
            headers: {
                Accept: 'application/vnd.github.v3+json',
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`GitHub API error: ${response.status} ${error}`)
        }

        return response
    }

    private parseRepoUrl(repo: Repository): {owner: string; repo: string} | null {
        if (!repo.remote_url) {
            return null
        }

        // Parse GitHub URL (https://github.com/owner/repo.git or git@github.com:owner/repo.git)
        const match = repo.remote_url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) {
            return null
        }

        return {
            owner: match[1],
            repo: match[2],
        }
    }

    async createBranch(repo: Repository, branchName: string): Promise<string> {
        const repoInfo = this.parseRepoUrl(repo)
        if (!repoInfo) {
            throw new Error('Invalid GitHub repository URL')
        }

        // Get default branch (usually 'main' or 'master')
        const repoResponse = await this.apiRequest(`/repos/${repoInfo.owner}/${repoInfo.repo}`)
        const repoData = await repoResponse.json() as {default_branch: string}
        const defaultBranch = repoData.default_branch

        // Get the SHA of the default branch
        const refResponse = await this.apiRequest(`/repos/${repoInfo.owner}/${repoInfo.repo}/git/ref/heads/${defaultBranch}`)
        const refData = await refResponse.json() as {object: {sha: string}}
        const sha = refData.object.sha

        // Create new branch
        await this.apiRequest(`/repos/${repoInfo.owner}/${repoInfo.repo}/git/refs`, {
            body: JSON.stringify({
                ref: `refs/heads/${branchName}`,
                sha,
            }),
            method: 'POST',
        })

        logger.info(`[GitHub] Created branch ${branchName}`)
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
            throw new Error('Invalid GitHub repository URL')
        }

        // Get default branch
        const repoResponse = await this.apiRequest(`/repos/${repoInfo.owner}/${repoInfo.repo}`)
        const repoData = await repoResponse.json() as {default_branch: string}
        const baseBranch = repoData.default_branch

        // Create pull request
        const prResponse = await this.apiRequest(`/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`, {
            body: JSON.stringify({
                base: baseBranch,
                body: description,
                head: branch,
                title,
            }),
            method: 'POST',
        })

        const prData = await prResponse.json() as {html_url: string; number: number}
        logger.info(`[GitHub] Created PR #${prData.number}: ${prData.html_url}`)
        return prData.number.toString()
    }

    async addComment(repo: Repository, mrId: string, comment: string): Promise<void> {
        const repoInfo = this.parseRepoUrl(repo)
        if (!repoInfo) {
            throw new Error('Invalid GitHub repository URL')
        }

        await this.apiRequest(`/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${mrId}/comments`, {
            body: JSON.stringify({
                body: comment,
            }),
            method: 'POST',
        })

        logger.info(`[GitHub] Added comment to PR #${mrId}`)
    }

    async getStatus(repo: Repository, branch: string): Promise<MRStatus | null> {
        const repoInfo = this.parseRepoUrl(repo)
        if (!repoInfo) {
            return null
        }

        // Find PR for this branch
        const prsResponse = await this.apiRequest(`/repos/${repoInfo.owner}/${repoInfo.repo}/pulls?head=${repoInfo.owner}:${branch}&state=all`)
        const prs = await prsResponse.json() as Array<{
            body: string
            html_url: string
            merged: boolean
            number: number
            state: 'open' | 'closed'
            title: string
        }>

        if (prs.length === 0) {
            return null
        }

        const pr = prs[0]
        return {
            description: pr.body || '',
            id: pr.number.toString(),
            state: pr.merged ? 'merged' : pr.state === 'open' ? 'open' : 'closed',
            title: pr.title,
            url: pr.html_url,
        }
    }
}
