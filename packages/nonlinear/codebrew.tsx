/** @jsxImportSource preact */
import type {ComponentType, VNode} from 'preact'

import {registerApp} from '@garage44/common/lib/codebrew-registry'
import {h} from 'preact'

import {registerAgentsWebSocketApiRoutes} from './api/agents'
import {registerCIWebSocketApiRoutes} from './api/ci'
import {registerDeployWebSocketApiRoutes} from './api/deploy'
import apiDocs, {registerDocsWebSocketApiRoutes} from './api/docs'
import {registerLabelsWebSocketApiRoutes} from './api/labels'
import apiRepositories, {registerRepositoriesWebSocketApiRoutes} from './api/repositories'
import {registerTicketsWebSocketApiRoutes} from './api/tickets'
import {logger} from './service'
import {Board, Docs, Settings, TicketDetail} from './src/components/pages'

registerApp({
    apiRoutes: (router) => {
        apiDocs(router)
        apiRepositories(router)
        router.post('/webhook', async (req: Request) => {
            const {handleWebhook} = await import('./lib/deploy/webhook')
            return await handleWebhook(req)
        })
    },
    defaultRoute: '/nonlinear/board',
    description: 'Project management and workflow automation',
    icon: 'view_kanban',
    id: 'nonlinear',
    menuItems: [
        {href: '/nonlinear/docs', icon: 'description', text: 'Documentation'},
        {href: '/nonlinear/board', icon: 'view_kanban', text: 'Development'},
    ],
    name: 'Nonlinear',
    onInit: () => logger.info('initialized'),
    routes: [
        {component: Docs, path: '/nonlinear/docs'},
        {component: Board, default: true, path: '/nonlinear/board'},
        {
            component: ((props: {ticketId?: string}) => <TicketDetail ticketId={props.ticketId ?? ''} />) as ComponentType,
            path: '/nonlinear/tickets/:ticketId',
        },
        {component: (): VNode => <Settings />, path: '/nonlinear/settings'},
        {
            component: ((props: Record<string, unknown>) => (
                <Settings tabId={(props as {tabId?: string}).tabId} />
            )) as ComponentType,
            path: '/nonlinear/settings/:tabId',
        },
    ],
    wsRoutes: (wsManager) => {
        registerRepositoriesWebSocketApiRoutes(wsManager)
        registerTicketsWebSocketApiRoutes(wsManager)
        registerAgentsWebSocketApiRoutes(wsManager)
        registerCIWebSocketApiRoutes(wsManager)
        registerLabelsWebSocketApiRoutes(wsManager)
        registerDeployWebSocketApiRoutes(wsManager)
        registerDocsWebSocketApiRoutes(wsManager)
    },
})
