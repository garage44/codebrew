import {h} from 'preact'
import {registerApp} from '@garage44/common/lib/codebrew-registry'
import {Board, Docs, Settings, TicketDetail} from './src/components/pages'
import apiDocs from './api/docs'
import apiRepositories from './api/repositories'
import {registerDeployWebSocketApiRoutes} from './api/deploy'
import {registerDocsWebSocketApiRoutes} from './api/docs'
import {registerRepositoriesWebSocketApiRoutes} from './api/repositories'
import {registerTicketsWebSocketApiRoutes} from './api/tickets'
import {registerAgentsWebSocketApiRoutes} from './api/agents'
import {registerCIWebSocketApiRoutes} from './api/ci'
import {registerLabelsWebSocketApiRoutes} from './api/labels'

registerApp({
    apiRoutes: (router) => {
        apiDocs(router)
        apiRepositories(router)
        router.post('/webhook', async(req: Request) => {
            const {handleWebhook} = await import('./lib/deploy/webhook')
            return await handleWebhook(req)
        })
    },
    defaultRoute: '/nonlinear/board',
    icon: 'view_kanban',
    id: 'nonlinear',
    menuItems: [
        {href: '/nonlinear/docs', icon: 'description', text: 'Documentation'},
        {href: '/nonlinear/board', icon: 'view_kanban', text: 'Development'},
    ],
    name: 'Nonlinear',
    routes: [
        {component: Docs, path: '/nonlinear/docs'},
        {component: Board, default: true, path: '/nonlinear/board'},
        {component: (props: {ticketId?: string}) => <TicketDetail ticketId={props.ticketId || ''} />, path: '/nonlinear/tickets/:ticketId'},
        {component: () => <Settings />, path: '/nonlinear/settings'},
        {component: (props: {tabId?: string}) => <Settings tabId={props.tabId} />, path: '/nonlinear/settings/:tabId'},
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
