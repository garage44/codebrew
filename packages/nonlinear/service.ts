#!/usr/bin/env bun
import {URL, fileURLToPath} from 'node:url'
import {createBunWebSocketHandler} from '@garage44/common/lib/ws-server'
import {bunchyArgs, bunchyService} from '@garage44/bunchy'
import {
    createRuntime,
    createWelcomeBanner,
    setupBunchyConfig,
    createWebSocketManagers,
    service,
    loggerTransports,
} from '@garage44/common/service'
import {hideBin} from 'yargs/helpers'
import path from 'node:path'
import yargs from 'yargs'
import {initDatabase} from './lib/database.ts'
import {initMiddleware} from './lib/middleware.ts'
import {config, initConfig} from './lib/config.ts'

export const serviceDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(serviceDir, path.join(serviceDir, 'package.json'))

function welcomeBanner() {
    return createWelcomeBanner('Nonlinear', 'AI-Powered Automated Project Management', runtime.version)
}

// In case we start in development mode.
let bunchyConfig = null

const logger = loggerTransports(config.logger, 'service')

const BUN_ENV = process.env.BUN_ENV || 'production'

const cli = yargs(hideBin(process.argv))
cli.scriptName('nonlinear')

if (BUN_ENV === 'development') {
    bunchyConfig = setupBunchyConfig({
        logPrefix: 'N',
        serviceDir: runtime.service_dir,
        version: runtime.version,
    })

    bunchyArgs(cli, bunchyConfig)
}

void cli.usage('Usage: $0 [task]')
    .detectLocale(false)
    .command('start', 'Start the Nonlinear service', (yargs) => {
        // oxlint-disable-next-line no-console
        console.log(welcomeBanner())
        return yargs
            .option('host', {
                alias: 'h',
                default: 'localhost',
                describe: 'hostname to listen on',
                type: 'string',
            })
            .option('port', {
                alias: 'p',
                default: 3030,
                describe: 'port to run the Nonlinear service on',
                type: 'number',
            })
    }, async(argv) => {
        await initConfig(config)

        // Initialize database
        const database = initDatabase()

        /*
         * Initialize common service (including UserManager) with database
         * This will automatically create default admin user if database is empty
         */
        const configPath = process.env.CONFIG_PATH || '~/.nonlinearrc'
        await service.init({appName: 'nonlinear', configPath, useBcrypt: false}, database)

        // Initialize middleware and WebSocket server
        const {handleRequest, sessionMiddleware} = await initMiddleware(bunchyConfig)

        // Create WebSocket managers
        const {bunchyManager, wsManager} = createWebSocketManagers(undefined, sessionMiddleware)

        // Map of endpoint to manager for the handler
        const wsManagers = new Map([
            ['/ws', wsManager],
            ['/bunchy', bunchyManager],
        ])

        const enhancedWebSocketHandler = createBunWebSocketHandler(wsManagers)

        // Register WebSocket API routes
        const {registerTicketsWebSocketApiRoutes} = await import('./api/tickets.ts')
        const {registerRepositoriesWebSocketApiRoutes} = await import('./api/repositories.ts')
        const {registerAgentsWebSocketApiRoutes} = await import('./api/agents.ts')
        const {registerCIWebSocketApiRoutes} = await import('./api/ci.ts')
        const {registerLabelsWebSocketApiRoutes} = await import('./api/labels.ts')
        const {registerDocsWebSocketApiRoutes} = await import('./api/docs.ts')

        registerTicketsWebSocketApiRoutes(wsManager)
        registerRepositoriesWebSocketApiRoutes(wsManager)
        registerAgentsWebSocketApiRoutes(wsManager)
        registerCIWebSocketApiRoutes(wsManager)
        registerLabelsWebSocketApiRoutes(wsManager)
        registerDocsWebSocketApiRoutes(wsManager)

        // Initialize agent system
        const {initAgentStatusTracking} = await import('./lib/agent/status.ts')
        const {initAgentScheduler} = await import('./lib/agent/scheduler.ts')
        const {initAgentAvatars} = await import('./lib/agent/avatars.ts')
        const {initTokenUsageTracking} = await import('./lib/agent/token-usage.ts')
        const {initAgentCommentBroadcasting} = await import('./lib/agent/comments.ts')
        const {initAgentTicketUpdateBroadcasting} = await import('./lib/agent/ticket-updates.ts')

        initAgentStatusTracking(wsManager)
        initAgentAvatars()
        initTokenUsageTracking(wsManager)
        initAgentCommentBroadcasting(wsManager)
        initAgentTicketUpdateBroadcasting(wsManager)
        await initAgentScheduler()

        // Start Bun server
        const server = Bun.serve({
            fetch: (req, server) => {
                return handleRequest(req, server)
            },
            hostname: argv.host,
            port: argv.port,
            websocket: enhancedWebSocketHandler,
        })

        if (BUN_ENV === 'development') {
            await bunchyService(server, bunchyConfig, bunchyManager)
        }

        logger.info(`Nonlinear service started on http://${argv.host}:${argv.port}`)
    })
    .parse()

export {
    logger,
    runtime,
}
