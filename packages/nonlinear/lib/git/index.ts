/**
 * Git Platform Factory
 * Creates the appropriate git platform adapter based on repository configuration
 */

import type {GitPlatform} from './base.ts'
import type {Repository} from '../database.ts'
import {LocalGitAdapter} from './local.ts'
import {GitHubAdapter} from './github.ts'
import {GitLabAdapter} from './gitlab.ts'
import {config} from '../config.ts'

export function createGitPlatform(repo: Repository): GitPlatform {
    switch (repo.platform) {
        case 'github': {
            const adapter = new GitHubAdapter()
            if (!adapter.isConfigured()) {
                throw new Error('GitHub adapter is not configured. Set GITHUB_TOKEN environment variable or configure in .nonlinearrc')
            }
            return adapter
        }
        case 'gitlab': {
            const adapter = new GitLabAdapter()
            if (!adapter.isConfigured()) {
                throw new Error('GitLab adapter is not configured. Set GITLAB_TOKEN environment variable or configure in .nonlinearrc')
            }
            return adapter
        }
        case 'local': {
            return new LocalGitAdapter()
        }
        default: {
            throw new Error(`Unknown git platform: ${repo.platform}`)
        }
    }
}

export function getDefaultPlatform(): 'github' | 'gitlab' | 'local' {
    return config.git.defaultPlatform as 'github' | 'gitlab' | 'local'
}

export {
    type GitPlatform,
    type MRStatus,
} from './base.ts'
export {LocalGitAdapter} from './local.ts'
export {GitHubAdapter} from './github.ts'
export {GitLabAdapter} from './gitlab.ts'
