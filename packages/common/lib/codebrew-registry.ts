/**
 * Codebrew plugin registry
 * Apps register via registerApp(); Codebrew shell reads via getApps(), getApp()
 */

import type {ComponentType} from 'preact'

import type {WebSocketServerManager} from './ws-server'

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
    menuItems?: {
        href: string
        icon: string
        text: string
    }[]
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
