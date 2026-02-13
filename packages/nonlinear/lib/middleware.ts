import type {Logger} from '@garage44/common/lib/logger.node'

import {createAvatarRoutes} from '@garage44/common/lib/avatar-routes'
import {devContext} from '@garage44/common/lib/dev-context'
import {createFinalHandler, createMiddleware} from '@garage44/common/lib/middleware'
import {userManager} from '@garage44/common/service'
import path from 'node:path'

import {logger, runtime} from '../service.ts'

const _BUN_ENV = process.env.BUN_ENV || 'production'

// Simple HTTP router for Bun.serve that mimics Express pattern
class Router {
    routes: Array<{
        handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>
        method: string
        path: RegExp
    }> = []

    get(path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) {
        this.add('GET', path, handler)
    }

    post(path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) {
        this.add('POST', path, handler)
    }

    put(path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) {
        this.add('PUT', path, handler)
    }

    delete(path: string, handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>) {
        this.add('DELETE', path, handler)
    }

    private add(
        method: string,
        path: string,
        handler: (req: Request, params: Record<string, string>, session?: unknown) => Promise<Response>,
    ) {
        // Convert path params (e.g. /api/tickets/:id) to regex
        const regex = new RegExp('^' + path.replaceAll(/:[^/]+/g, '([^/]+)') + '$')
        this.routes.push({
            handler,
            method,
            path: regex,
        })
    }

    async route(req: Request, session?: unknown): Promise<Response | null> {
        const url = new URL(req.url)
        const pathname = url.pathname
        for (const {handler, method, path} of this.routes) {
            if (req.method === method && path.test(pathname)) {
                // Extract params
                const paramValues = pathname.match(path)?.slice(1) || []
                const params: Record<string, string> = {}
                paramValues.forEach((val, idx) => {
                    params[`param${idx}`] = val
                })
                return await handler(req, params, session)
            }
        }
        return null
    }
}

// Auth middleware that can be reused across routes
const requireAdmin = async (
    ctx: {session?: {userid?: string}},
    next: (ctx: {session?: {userid?: string}}) => Promise<unknown>,
) => {
    if (!ctx.session?.userid) {
        throw new Error('Unauthorized')
    }

    return next(ctx)
}

async function initMiddleware(_bunchyConfig: unknown) {
    const router = new Router()

    // Register common avatar routes (placeholder images and uploaded avatars)
    const avatarRoutes = createAvatarRoutes({
        appName: 'nonlinear',
        logger: logger as Logger,
        runtime,
    })
    avatarRoutes.registerPlaceholderRoute(router as {get: (path: string, handler: unknown) => void})
    avatarRoutes.registerAvatarRoute(router as {get: (path: string, handler: unknown) => void})

    // Register HTTP API endpoints
    const apiRepositories = (await import('../api/repositories.ts')).default
    await apiRepositories(router)

    // Register HTTP docs API endpoints (public access)
    const apiDocs = (await import('../api/docs.ts')).default
    apiDocs(router)

    // Register webhook endpoint (signature validation, no auth required)
    router.post('/webhook', async (req) => {
        const {handleWebhook} = await import('./deploy/webhook')
        return await handleWebhook(req)
    })

    const publicPath = path.join(runtime.service_dir, 'public')

    /*
     * Create unified final handler with built-in authentication API
     * Use environment variable for config path if set (for PR deployments)
     */
    const configPath = process.env.CONFIG_PATH || '~/.nonlinearrc'

    // Create a wrapper around finalHandleRequest to inject bootstrap state into index.html
    const originalFinalHandleRequest = createFinalHandler({
        configPath,
        contextFunctions: {
            adminContext: async () => ({admin: true}),
            deniedContext: async () => ({denied: true}),
            userContext: async () => ({user: true}),
        },
        customWebSocketHandlers: [],
        devContext,
        endpointAllowList: ['/api/login', '/api/docs', '/api/docs/by-path', '/api/docs/search', '/api/search', '/webhook'],
        logger,
        mimeTypes: {
            '.css': 'text/css',
            '.eot': 'application/vnd.ms-fontobject',
            '.gif': 'image/gif',
            '.jpeg': 'image/jpeg',
            '.jpg': 'image/jpeg',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
            '.ttf': 'font/ttf',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
        },
        packageName: 'nonlinear',
        publicPath,
        router,
        sessionCookieName: 'nonlinear-session',
        userManager,
    })

    // Wrap finalHandleRequest to inject bootstrap state into index.html
    const finalHandleRequest = async (request: Request, server?: unknown): Promise<Response | undefined> => {
        const response = await originalFinalHandleRequest(request, server)

        // Inject bootstrap state into index.html responses
        if (response && response.headers.get('Content-Type')?.includes('text/html')) {
            const url = new URL(request.url)
            // Only inject for HTML responses (not API or assets)
            if (!url.pathname.startsWith('/api') && !url.pathname.startsWith('/public')) {
                try {
                    const html = await response.text()

                    /*
                     * Get agent state and stats for bootstrap
                     * Use the same structure as the API response (status, stats)
                     */
                    const {getAllAgentStates} = await import('../lib/agent/state.ts')
                    const {getTaskStats} = await import('../lib/agent/tasks.ts')
                    const {getAgentStatus} = await import('../lib/agent/status.ts')
                    const agentStates = getAllAgentStates()

                    // Enrich with status and stats (matching API response structure)
                    const bootstrapAgents: Record<
                        string,
                        {
                            stats?: {completed: number; failed: number; pending: number; processing: number}
                            status: 'idle' | 'working' | 'error' | 'offline'
                        }
                    > = {}
                    for (const [agentId, state] of Object.entries(agentStates)) {
                        const agentStatus = getAgentStatus(agentId)
                        const serviceOnline = state.serviceOnline

                        /*
                         * Determine status - if service is offline, status should be 'offline'
                         * Otherwise use the actual agent status (idle, working, error)
                         */
                        let status: 'idle' | 'working' | 'error' | 'offline' = (agentStatus?.status || 'idle') as
                            | 'idle'
                            | 'working'
                            | 'error'
                            | 'offline'
                        if (!serviceOnline && status !== 'working') {
                            status = 'offline'
                        }

                        bootstrapAgents[agentId] = {
                            stats: getTaskStats(agentId),
                            status,
                        }
                    }

                    // Inject bootstrap state script before closing </head>
                    const bootstrapScript = `
        <script>
            window.__NONLINEAR_BOOTSTRAP_STATE__ = ${JSON.stringify({agents: bootstrapAgents})};
        </script>`

                    const modifiedHtml = html.replace('</head>', `${bootstrapScript}\n    </head>`)

                    return new Response(modifiedHtml, {
                        headers: response.headers,
                        status: response.status,
                    })
                } catch (error) {
                    logger.warn(`[Middleware] Failed to inject bootstrap state: ${error}`)
                    return response
                }
            }
        }

        return response
    }

    // Create middleware to get sessionMiddleware for WebSocket managers
    const unifiedMiddleware = createMiddleware(
        {
            configPath,
            customWebSocketHandlers: [],
            endpointAllowList: ['/api/login', '/api/docs', '/api/docs/by-path', '/api/docs/search', '/api/search', '/webhook'],
            packageName: 'nonlinear',
            sessionCookieName: 'nonlinear-session',
        },
        userManager,
    )

    return {
        handleRequest: finalHandleRequest,
        // WebSocket handling is done in common middleware
        handleWebSocket: () => {},
        sessionMiddleware: unifiedMiddleware.sessionMiddleware,
    }
}

export {initMiddleware, requireAdmin}
