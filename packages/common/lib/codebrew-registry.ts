/**
 * Codebrew plugin registry
 * Apps register via registerApp(); Codebrew shell reads via getApps(), getApp()
 */

import type {ComponentType} from 'preact'

export interface CodebrewRoute {
    component: ComponentType
    default?: boolean
    path: string
}

export interface CodebrewAppPlugin {
    apiRoutes?: (router: ApiRouter) => void
    defaultRoute: string
    icon: string
    id: 'expressio' | 'nonlinear' | 'pyrite'
    menuComponent?: ComponentType
    menuItems?: Array<{
        href: string
        icon: string
        text: string
    }>
    name: string
    routes: CodebrewRoute[]
    wsRoutes?: (wsManager: WebSocketServerManager) => void
}

export interface ApiRouter {
    delete: (path: string, handler: unknown) => void
    get: (path: string, handler: unknown) => void
    post: (path: string, handler: unknown) => void
    put: (path: string, handler: unknown) => void
}

export interface WebSocketServerManager {
    api: {
        delete: (route: string, handler: unknown, middlewares?: unknown[]) => void
        get: (route: string, handler: unknown, middlewares?: unknown[]) => void
        post: (route: string, handler: unknown, middlewares?: unknown[]) => void
        put: (route: string, handler: unknown, middlewares?: unknown[]) => void
    }
}

const plugins = new Map<string, CodebrewAppPlugin>()

export function getApp(id: string): CodebrewAppPlugin | undefined {
    return plugins.get(id)
}

export function getApps(): CodebrewAppPlugin[] {
    return Array.from(plugins.values())
}

export function registerApp(plugin: CodebrewAppPlugin): void {
    plugins.set(plugin.id, plugin)
}
