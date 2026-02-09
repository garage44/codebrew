import {createFinalHandler} from '@garage44/common/lib/middleware'
import {createComplexAuthContext} from '@garage44/common/lib/profile.ts'
import {devContext} from '@garage44/common/lib/dev-context'
import {userManager} from '@garage44/common/service'
import {logger, runtime} from '../service.ts'
import apiChat from '../api/chat.ts'
import apiChannels from '../api/channels.ts'
import apiDashboard from '../api/dashboard.ts'
import apiGroups from '../api/groups.ts'
import apiI18n from '../api/i18n.ts'
import apiRecordings from '../api/recordings.ts'
import apiUsers from '../api/users.ts'
import {config} from '../lib/config.ts'
import {loadGroups} from './group.js'
import path from 'node:path'

// Type definitions
export type Session = {userid?: string}

export type Server = {
    upgrade: (request: Request, options: {data: unknown}) => boolean
}

// Simple HTTP router for Bun.serve that mimics Express pattern
export class Router {
    routes: Array<{
        handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>
        method: string
        path: RegExp
    }> = []

    get(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>) {
        this.add('GET', path, handler)
    }

    post(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>) {
        this.add('POST', path, handler)
    }

    put(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>) {
        this.add('PUT', path, handler)
    }

    delete(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>) {
        this.add('DELETE', path, handler)
    }

    private add(
        method: string,
        path: string,
        handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>,
    ) {
        // Convert path params (e.g. /api/groups/:id) to regex
        const regex = new RegExp('^' + path.replaceAll(/:[^/]+/g, '([^/]+)') + '$')
        this.routes.push({
            handler,
            method,
            path: regex,
        })
    }

    async route(req: Request, session?: Session): Promise<Response | null> {
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

/*
 * SFU Proxy - proxies WebSocket connections to Galène
 * This is a pass-through proxy that doesn't require WebSocket server management
 */
async function proxySFUWebSocket(request: Request, server: Server) {
    const sfuUrl = config.sfu.url.replace('http://', 'ws://').replace('https://', 'wss://')
    const url = new URL(request.url)

    /*
     * Galene expects WebSocket connections at /ws, not /sfu
     * Map client's /sfu path to Galene's /ws endpoint
     */
    const targetUrl = `${sfuUrl}/ws${url.search}`

    logger.info(`[SFU Proxy] Connecting to upstream: ${targetUrl}`)
    logger.debug(`[SFU Proxy] Client requested: ${request.url}`)
    logger.debug(`[SFU Proxy] SFU base URL: ${config.sfu.url}`)
    logger.debug(`[SFU Proxy] Converted SFU URL: ${sfuUrl}`)
    logger.debug(`[SFU Proxy] Target WebSocket URL: ${targetUrl}`)

    /*
     * Verify Galène is accessible before attempting WebSocket connection
     * This helps diagnose connection issues early
     */
    try {
        const healthCheckUrl = config.sfu.url.replace('/ws', '').replace('ws://', 'http://').replace('wss://', 'https://')
        const healthResponse = await fetch(`${healthCheckUrl}/stats.json`, {signal: AbortSignal.timeout(2000)})
        if (healthResponse.ok) {
            logger.debug('[SFU Proxy] Galène health check passed')
        } else {
            logger.warn(`[SFU Proxy] Galène health check failed: ${healthResponse.status} ${healthResponse.statusText}`)
        }
    } catch(healthError) {
        const errorMessage = healthError instanceof Error ? healthError.message : String(healthError)
        logger.warn(`[SFU Proxy] Galène health check error (non-fatal): ${errorMessage}`)
        // Continue anyway - WebSocket might still work even if HTTP health check fails
    }

    try {
        /*
         * Create WebSocket connection to upstream server (Galène)
         * Note: For server-side WebSocket clients in Bun, we use the WebSocket API
         * If connecting to WSS upstream, certificate validation may be needed
         */
        logger.debug(`[SFU Proxy] Creating upstream WebSocket connection to ${targetUrl}`)
        const upstream = new WebSocket(targetUrl)

        /*
         * Wait for upstream connection to open before upgrading client
         * This ensures we can catch connection errors early
         */
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                logger.error(`[SFU Proxy] Connection timeout after 5s for ${targetUrl}`)
                const stateMsg = `${upstream.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`
                logger.error(`[SFU Proxy] Connection state at timeout: ${stateMsg}`)
                upstream.close()
                reject(new Error(`Connection timeout after 5s for ${targetUrl}`))
            }, 5000)

            upstream.onopen = () => {
                clearTimeout(timeout)
                logger.info(`[SFU Proxy] Successfully connected to upstream: ${targetUrl}`)
                resolve()
            }

            upstream.onerror = (error: Event) => {
                clearTimeout(timeout)
                logger.error(`[SFU Proxy] Upstream WebSocket error for ${targetUrl}`)
                logger.error('[SFU Proxy] Error event:', error)
                logger.error(`[SFU Proxy] Error type: ${error.type}`)
                const stateMsg = `${upstream.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`
                logger.error(`[SFU Proxy] Upstream connection state: ${stateMsg}`)

                // Log additional error details if available
                if ('message' in error) {
                    logger.error(`[SFU Proxy] Error message: ${(error as {message?: string}).message}`)
                }
                if ('error' in error) {
                    logger.error('[SFU Proxy] Error object:', (error as {error?: unknown}).error)
                }

                // Try to get more error details
                if (upstream.readyState === WebSocket.CLOSED || upstream.readyState === WebSocket.CLOSING) {
                    logger.error(`[SFU Proxy] Connection closed immediately, check if Galene is running on ${targetUrl}`)
                    const httpsMsg = 'If using HTTPS for Pyrite, ensure Galene is accessible and the connection URL is correct'
                    logger.error(`[SFU Proxy] ${httpsMsg}`)
                }

                const baseMsg = `Failed to connect to ${targetUrl}. Check if Galene is running and accessible.`
                const errorMsg = `${baseMsg} Connection state: ${upstream.readyState}`
                reject(new Error(errorMsg))
            }

            upstream.onclose = (event: CloseEvent) => {
                clearTimeout(timeout)
                logger.warn(`[SFU Proxy] Upstream connection closed before upgrade: ${event.code} ${event.reason || 'no reason'}`)
                if (event.code !== 1000) {
                    logger.error(`[SFU Proxy] Abnormal close: code=${event.code}, reason=${event.reason || 'none'}`)
                    logger.error(`[SFU Proxy] Connection was clean: ${event.wasClean}`)
                }
                // Only reject if not already resolved
                if (upstream.readyState !== WebSocket.OPEN) {
                    reject(new Error(`Connection closed: ${event.code} ${event.reason || 'no reason'}`))
                }
            }
        })

        // Upgrade client connection with special marker to skip manager lookup
        const upgraded = server.upgrade(request, {
            data: {
                endpoint: '/sfu',
                // Mark as proxy to skip manager lookup
                proxy: true,
                // Store upstream connection for generic forwarding
                upstream,
            },
        })

        if (upgraded) {
            logger.info('[SFU Proxy] Client connection upgraded successfully')
            // Bidirectional message forwarding will be handled by common WebSocket handler
            return
        }

        logger.error('[SFU Proxy] Failed to upgrade client connection')
        upstream.close()
        return new Response('WebSocket upgrade failed', {status: 400})
    } catch(error) {
        logger.error(`[SFU Proxy] Failed to connect to SFU: ${error}`)
        if (error instanceof Error) {
            logger.error(`[SFU Proxy] Error details: ${error.message}`)
            logger.error(`[SFU Proxy] Stack: ${error.stack}`)
        }
        return new Response(`Failed to connect to SFU: ${error instanceof Error ? error.message : String(error)}`, {status: 502})
    }
}


// Auth middleware that can be reused across routes
const requireAdmin = async(ctx: {session?: Session}, next: (ctx: {session?: Session}) => Promise<unknown>) => {
    if (!ctx.session?.userid) {
        throw new Error('Unauthorized')
    }

    /*
     * User lookup will be handled by middleware's UserManager
     * The authentication check is done by the middleware layer
     */
    return next(ctx)
}

async function initMiddleware(_bunchyConfig) {
    const router = new Router()

    // Register HTTP API endpoints using familiar Express-like pattern
    await apiChat(router)
    await apiChannels(router)
    await apiDashboard(router)
    await apiGroups(router)
    await apiI18n(router)
    await apiRecordings(router)
    await apiUsers(router)

    const publicPath = path.join(runtime.service_dir, 'public')

    // Create complex auth context for Pyrite (needs groups and users data)
    const contextFunctions = await createComplexAuthContext({
        loadGroups,
        loadUsers: () => userManager.listUsers(),
    })

    /*
     * Create unified final handler with built-in authentication API
     * Use environment variable for config path if set (for PR deployments)
     */
    const configPath = process.env.CONFIG_PATH || '~/.pyriterc'
    const finalHandleRequest = createFinalHandler({
        configPath,
        contextFunctions: {
            adminContext: contextFunctions.adminContext,
            deniedContext: contextFunctions.deniedContext,
            userContext: contextFunctions.userContext,
        },
        customWebSocketHandlers: [{
            handler: proxySFUWebSocket,
            path: '/sfu',
        }],
        devContext,
        endpointAllowList: ['/api/i18n', '/api/chat/emoji', '/api/groups/public', '/api/login'],
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
        packageName: 'pyrite',
        publicPath,
        router,
        sessionCookieName: 'pyrite-session',
        userManager,
    })

    return {
        handleRequest: finalHandleRequest,
        // WebSocket handling is done in common middleware
        handleWebSocket: () => {},
    }
}

export {
    initMiddleware,
    requireAdmin,
}
