/**
 * Codebrew plugin registry
 * Apps register via registerApp(); Codebrew shell reads via getApps(), getApp()
 *
 * @see ADR-035: Codebrew Plugin Architecture
 */

import type {ComponentType} from 'preact'

import type {WebSocketServerManager} from './ws-server'

export interface CodebrewRoute {
    component: ComponentType
    default?: boolean
    path: string
}

export interface ApiRouter {
    delete: (path: string, handler: unknown) => void
    get: (path: string, handler: unknown) => void
    post: (path: string, handler: unknown) => void
    put: (path: string, handler: unknown) => void
}

/** Context provided to plugins at init time (server-side only) */
export interface CodebrewPluginContext {
    config: Record<string, unknown>
    database: unknown
    logger: {debug: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void; warn: (msg: string) => void}
    router: ApiRouter
}

export interface CodebrewAppPlugin {
    apiRoutes?: (router: ApiRouter) => void
    basePath: string
    defaultRoute: string
    icon: string
    id: 'expressio' | 'nonlinear' | 'pyrite'
    init?: (ctx: CodebrewPluginContext) => void | Promise<void>
    menuComponent?: ComponentType
    menuItems?: {
        href: string
        icon: string
        text: string
    }[]
    name: string
    presenceWidget?: ComponentType
    routes: CodebrewRoute[]
    wsRoutes?: (wsManager: WebSocketServerManager) => void
}

export type {WebSocketServerManager}

const plugins = new Map<string, CodebrewAppPlugin>()

export function getApp(id: string): CodebrewAppPlugin | undefined {
    return plugins.get(id)
}

export function getApps(): CodebrewAppPlugin[] {
    return [...plugins.values()]
}

export function registerApp(plugin: CodebrewAppPlugin): void {
    plugins.set(plugin.id, plugin)
}
