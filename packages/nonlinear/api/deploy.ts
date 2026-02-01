/**
 * Deployment WebSocket API Routes
 * Allows AI agents to trigger and manage deployments
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {deployPR, regeneratePRNginx, type PRMetadata} from '../lib/deploy/pr-deploy'
import {cleanupPRDeployment} from '../lib/deploy/pr-cleanup'
import {getPRDeployment} from '../lib/deploy/pr-registry'
import {logger} from '../service.ts'

export function registerDeployWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Deploy a PR (agent-controlled)
    wsManager.api.post('/api/deploy/pr', async(ctx, req) => {
        const userId = ctx.user?.id
        if (!userId) {
            return {error: 'Unauthorized'}
        }

        const body = await req.json() as {
            pr_number: number
            branch: string
            sha?: string
            author?: string
        }

        if (!body.pr_number || !body.branch) {
            return {error: 'Missing required fields: pr_number, branch'}
        }

        try {
            const pr: PRMetadata = {
                author: body.author || 'agent',
                head_ref: body.branch,
                head_sha: body.sha || '',
                is_fork: false,
                number: body.pr_number,
                repo_full_name: 'garage44/garage44',
            }

            logger.info(`[Deploy API] Agent ${userId} triggering deployment for PR #${body.pr_number}`)
            const result = await deployPR(pr)

            if (result.success && result.deployment) {
                return {
                    deployment: {
                        number: result.deployment.number,
                        ports: result.deployment.ports,
                        status: result.deployment.status,
                        urls: Object.keys(result.deployment.ports).map((pkg) => ({
                            package: pkg,
                            url: `https://pr-${body.pr_number}-${pkg}.garage44.org`,
                        })),
                    },
                    message: result.message,
                    success: true,
                }
            }

            return {
                error: result.message,
                success: false,
            }
        } catch (error) {
            logger.error('[Deploy API] Deployment error:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    // Get deployment status
    wsManager.api.get('/api/deploy/status/:prNumber', async(ctx, req) => {
        const userId = ctx.user?.id
        if (!userId) {
            return {error: 'Unauthorized'}
        }

        const prNumber = parseInt(req.params.prNumber, 10)
        if (isNaN(prNumber)) {
            return {error: 'Invalid PR number'}
        }

        try {
            const deployment = await getPRDeployment(prNumber)
            if (!deployment) {
                return {
                    error: `PR #${prNumber} deployment not found`,
                    success: false,
                }
            }

            return {
                deployment: {
                    author: deployment.author,
                    created: deployment.created,
                    number: deployment.number,
                    ports: deployment.ports,
                    status: deployment.status,
                    updated: deployment.updated,
                    urls: Object.keys(deployment.ports).map((pkg) => ({
                        package: pkg,
                        url: `https://pr-${prNumber}-${pkg}.garage44.org`,
                    })),
                },
                success: true,
            }
        } catch (error) {
            logger.error('[Deploy API] Status check error:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })

    // Cleanup deployment
    wsManager.api.post('/api/deploy/cleanup/:prNumber', async(ctx, req) => {
        const userId = ctx.user?.id
        if (!userId) {
            return {error: 'Unauthorized'}
        }

        const prNumber = parseInt(req.params.prNumber, 10)
        if (isNaN(prNumber)) {
            return {error: 'Invalid PR number'}
        }

        try {
            logger.info(`[Deploy API] Agent ${userId} triggering cleanup for PR #${prNumber}`)
            const result = await cleanupPRDeployment(prNumber)

            return {
                message: result.message,
                success: result.success,
            }
        } catch (error) {
            logger.error('[Deploy API] Cleanup error:', error)
            return {
                error: error instanceof Error ? error.message : String(error),
                success: false,
            }
        }
    })
}
