import type {Logger} from '@garage44/common/lib/logger.node'

import {createAvatarRoutes} from '@garage44/common/lib/avatar-routes'
import {devContext} from '@garage44/common/lib/dev-context'
import {createFinalHandler} from '@garage44/common/lib/middleware'
import {adminContext, deniedContext, userContext} from '@garage44/common/lib/profile.ts'
import {userManager} from '@garage44/common/service'
import path from 'node:path'

import apiConfig from '../api/config.ts'
import apiI18n from '../api/i18n.ts'
import apiUsers from '../api/users.ts'
import apiWorkspaces from '../api/workspaces'
import {logger, runtime} from '../service.ts'

// Simple HTTP router for Bun.serve that mimics Express pattern
type Session = Record<string, string> | undefined

class Router {
    routes: {
        handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>
        method: string
        path: RegExp
    }[] = []

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
        // Convert path params (e.g. /api/workspaces/:id) to regex
        const regex = new RegExp('^' + path.replaceAll(/:[^/]+/g, '([^/]+)') + '$')
        this.routes.push({
            handler,
            method,
            path: regex,
        })
    }

    async route(req: Request, session?: Record<string, string>): Promise<Response | null> {
        const url = new URL(req.url)
        const {pathname} = url
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

// Auth middleware that can be reused across workspace routes
const requireAdmin = async (
    ctx: {session?: {userid?: string}},
    next: (ctx: {session?: {userid?: string}}) => Promise<unknown>,
) => {
    if (!ctx.session?.userid) {
        throw new Error('Unauthorized')
    }

    /*
     * User lookup will be handled by middleware's UserManager
     * The authentication check is done by the middleware layer
     */
    return next(ctx)
}

async function initMiddleware(_bunchyConfig: unknown) {
    const router = new Router()

    // Register common avatar routes (placeholder images and uploaded avatars)
    const avatarRoutes = createAvatarRoutes({
        appName: 'expressio',
        logger: logger as Logger | undefined,
        runtime,
    })
    const routerAdapter = {
        get: (path: string, handler: unknown) => {
            router.get(path, handler as (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>)
        },
    } as unknown as Parameters<typeof avatarRoutes.registerPlaceholderRoute>[0]
    avatarRoutes.registerPlaceholderRoute(routerAdapter)
    avatarRoutes.registerAvatarRoute(routerAdapter)

    // Register HTTP API endpoints using familiar Express-like pattern
    const httpRouterAdapter = {
        get: (path: string, handler: (req: Request, params: Record<string, string>) => Response) => {
            router.get(path, async (req: Request, params: Record<string, string>) => {
                const response = handler(req, params)
                return response instanceof Promise ? await response : response
            })
        },
    } as Parameters<typeof apiI18n>[0]
    await apiI18n(httpRouterAdapter)
    await apiConfig(router as Parameters<typeof apiConfig>[0])
    await apiUsers(router as Parameters<typeof apiUsers>[0])
    await apiWorkspaces(router as Parameters<typeof apiWorkspaces>[0])

    const publicPath = path.join(runtime.service_dir, 'public')

    /*
     * Create unified final handler with built-in authentication API
     * Use environment variable for config path if set (for PR deployments)
     */
    const configPath = process.env.CONFIG_PATH || '~/.expressiorc'
    const finalHandleRequest = createFinalHandler({
        configPath,
        contextFunctions: {
            adminContext,
            deniedContext,
            userContext,
        },
        customWebSocketHandlers: undefined,
        devContext: devContext as {addHttp: (data: unknown) => void},
        endpointAllowList: ['/api/translations', '/api/login'],
        logger,
        mimeTypes: undefined,
        packageName: 'expressio',
        publicPath,
        router: router as {route: (request: Request, session: unknown) => Promise<Response | null>},
        sessionCookieName: 'expressio-session',
        userManager,
    })

    return {
        handleRequest: finalHandleRequest,
        // WebSocket handling is done in common middleware
        handleWebSocket: () => {},
    }
}

export {initMiddleware, requireAdmin}
