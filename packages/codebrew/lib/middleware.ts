import type {Logger} from '@garage44/common/lib/logger.node'

import {createAvatarRoutes} from '@garage44/common/lib/avatar-routes'
import {getApps, type ApiRouter} from '@garage44/common/lib/codebrew-registry'
import {devContext} from '@garage44/common/lib/dev-context'
import {createFinalHandler, createMiddleware} from '@garage44/common/lib/middleware'
import {userManager} from '@garage44/common/service'
import path from 'node:path'

import {logger, runtime} from '../service.ts'

type Session = Record<string, string> | undefined

class Router {
    routes: {
        handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>
        method: string
        path: RegExp
    }[] = []

    get(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>): void {
        this.add('GET', path, handler)
    }

    post(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>): void {
        this.add('POST', path, handler)
    }

    put(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>): void {
        this.add('PUT', path, handler)
    }

    delete(path: string, handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>): void {
        this.add('DELETE', path, handler)
    }

    private add(
        method: string,
        path: string,
        handler: (req: Request, params: Record<string, string>, session?: Session) => Promise<Response>,
    ): void {
        const regex = new RegExp('^' + path.replaceAll(/:[^/]+/g, '([^/]+)') + '$')
        this.routes.push({handler, method, path: regex})
    }

    async route(req: Request, session?: Session): Promise<Response | null> {
        const url = new URL(req.url)
        const {pathname} = url
        for (const {handler, method, path} of this.routes) {
            if (req.method === method && path.test(pathname)) {
                const paramValues = pathname.match(path)?.slice(1) || []
                const params: Record<string, string> = {}
                for (const [idx, val] of paramValues.entries()) {
                    params[`param${idx}`] = val
                }
                return handler(req, params, session)
            }
        }
        return null
    }
}

async function initMiddleware(_bunchyConfig: unknown): Promise<{
    handleRequest: (req: Request, session?: Session) => Promise<Response>
    handleWebSocket: () => void
    sessionMiddleware: (req: Request, res: Response, next: () => void) => void
}> {
    const router = new Router()

    const avatarRoutes = createAvatarRoutes({
        appName: 'codebrew',
        logger: logger as Logger,
        runtime,
    })
    avatarRoutes.registerPlaceholderRoute(router as {get: (path: string, handler: unknown) => void})
    avatarRoutes.registerAvatarRoute(router as {get: (path: string, handler: unknown) => void})

    // Register API routes from each plugin
    for (const plugin of getApps()) {
        if (plugin.apiRoutes) {
            plugin.apiRoutes(router as ApiRouter)
        }
    }

    const publicPath = path.join(runtime.service_dir, 'public')

    const configPath = process.env.CONFIG_PATH || '~/.codebrewrc'
    const unifiedMiddleware = createMiddleware(
        {
            configPath,
            customWebSocketHandlers: [],
            endpointAllowList: ['/api/login', '/api/docs', '/api/docs/by-path', '/api/docs/search', '/api/search', '/webhook'],
            packageName: 'codebrew',
            sessionCookieName: 'codebrew-session',
        },
        userManager,
    )

    const finalHandleRequest = createFinalHandler({
        configPath,
        contextFunctions: {
            adminContext: async (): Promise<{admin: true}> => ({admin: true}),
            deniedContext: async (): Promise<{denied: true}> => ({denied: true}),
            userContext: async (): Promise<{user: true}> => ({user: true}),
        },
        customWebSocketHandlers: [],
        devContext: devContext as {addHttp: (data: unknown) => void},
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
        packageName: 'codebrew',
        publicPath,
        router: router as {route: (request: Request, session: unknown) => Promise<Response | null>},
        sessionCookieName: 'codebrew-session',
        userManager,
    })

    return {
        handleRequest: finalHandleRequest as (req: Request, session?: Session) => Promise<Response>,
        handleWebSocket: (): void => {
            // WebSocket handler not implemented
        },
        sessionMiddleware: unifiedMiddleware.sessionMiddleware,
    }
}

export {initMiddleware}
