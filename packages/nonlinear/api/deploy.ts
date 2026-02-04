/**
 * Deployment WebSocket API Routes
 * Allows AI agents to trigger and manage deployments
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {deployPR, regeneratePRNginx, type PRMetadata} from '../lib/deploy/pr-deploy'
import {cleanupPRDeployment} from '../lib/deploy/pr-cleanup'
import {getPRDeployment} from '../lib/deploy/pr-registry'
import {logger} from '../service.ts'
import {
    DeployPRNumberParamsSchema,
    DeployPRRequestSchema,
} from '../lib/schemas/deploy.ts'
import {validateRequest} from '../lib/api/validate.ts'

export function registerDeployWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Deploy a PR (agent-controlled)
    wsManager.api.post('/api/deploy/pr', async(ctx, req) => {
        const userId = ctx.user?.id
        if (!userId) {
            return {error: 'Unauthorized'}
        }

        const body = await req.json()
        const data = validateRequest(DeployPRRequestSchema, body)

        try {
            const pr: PRMetadata = {
                author: data.author || 'agent',
                head_ref: data.branch,
                head_sha: data.sha || '',
                is_fork: false,
                number: data.pr_number,
                repo_full_name: 'garage44/garage44',
            }

            logger.info(`[Deploy API] Agent ${userId} triggering deployment for PR #${data.pr_number}`)
            const result = await deployPR(pr)

            if (result.success && result.deployment) {
                return {
                    deployment: {
                        number: result.deployment.number,
                        ports: result.deployment.ports,
                        status: result.deployment.status,
                        urls: Object.keys(result.deployment.ports).map((pkg) => ({
                            package: pkg,
                            url: `https://pr-${data.pr_number}-${pkg}.garage44.org`,
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

        const params = validateRequest(DeployPRNumberParamsSchema, req.params)

        try {
            const deployment = await getPRDeployment(params.prNumber)
            if (!deployment) {
                return {
                    error: `PR #${params.prNumber} deployment not found`,
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
                        url: `https://pr-${params.prNumber}-${pkg}.garage44.org`,
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

        const params = validateRequest(DeployPRNumberParamsSchema, req.params)

        try {
            logger.info(`[Deploy API] Agent ${userId} triggering cleanup for PR #${params.prNumber}`)
            const result = await cleanupPRDeployment(params.prNumber)

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
