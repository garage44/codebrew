import {createAvatarRoutes} from '@garage44/common/lib/avatar-routes'
import {devContext} from '@garage44/common/lib/dev-context'
import {createFinalHandler, createMiddleware} from '@garage44/common/lib/middleware'
import {userManager} from '@garage44/common/service'
import {getApps} from '@garage44/common/lib/codebrew-registry'
import {logger, runtime} from '../service.ts'
import type {Logger} from '@garage44/common/lib/logger.node'
import path from 'node:path'

type Session = Record<string, string> | undefined

class Router {
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
        const regex = new RegExp('^' + path.replaceAll(/:[^/]+/g, '([^/]+)') + '$')
        this.routes.push({handler, method, path: regex})
    }

    async route(req: Request, session?: Session): Promise<Response | null> {
        const url = new URL(req.url)
        const pathname = url.pathname
        for (const {handler, method, path} of this.routes) {
            if (req.method === method && path.test(pathname)) {
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

async function initMiddleware(_bunchyConfig: unknown) {
    const router = new Router()

    const avatarRoutes = createAvatarRoutes({
        appName: 'codebrew',
        logger: logger as Logger,
        runtime,
    })
    avatarRoutes.registerPlaceholderRoute(router)
    avatarRoutes.registerAvatarRoute(router)

    // Register API routes from each plugin
    for (const plugin of getApps()) {
        if (plugin.apiRoutes) {
            plugin.apiRoutes(router)
        }
    }

    const publicPath = path.join(runtime.service_dir, 'public')

    const configPath = process.env.CONFIG_PATH || '~/.codebrewrc'
    const unifiedMiddleware = createMiddleware({
        configPath,
        customWebSocketHandlers: [],
        endpointAllowList: [
            '/api/login',
            '/api/docs',
            '/api/docs/by-path',
            '/api/docs/search',
            '/api/search',
            '/webhook',
        ],
        packageName: 'codebrew',
        sessionCookieName: 'codebrew-session',
    }, userManager)

    const finalHandleRequest = createFinalHandler({
        configPath,
        contextFunctions: {
            adminContext: async() => ({admin: true}),
            deniedContext: async() => ({denied: true}),
            userContext: async() => ({user: true}),
        },
        customWebSocketHandlers: [],
        devContext,
        endpointAllowList: [
            '/api/login',
            '/api/docs',
            '/api/docs/by-path',
            '/api/docs/search',
            '/api/search',
            '/webhook',
        ],
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
        router,
        sessionCookieName: 'codebrew-session',
        userManager,
    })

    return {
        handleRequest: finalHandleRequest,
        handleWebSocket: () => {},
        sessionMiddleware: unifiedMiddleware.sessionMiddleware,
    }
}

export {
    initMiddleware,
}
