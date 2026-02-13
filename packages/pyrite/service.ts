#!/usr/bin/env bun
import {fileURLToPath, URL} from 'node:url'
import path from 'node:path'
import {
    bunchyArgs,
    bunchyService,
} from '@garage44/bunchy'
import {createBunWebSocketHandler} from '@garage44/common/lib/ws-server'
import {devContext} from '@garage44/common/lib/dev-context'
import {
    createRuntime,
    createWebSocketManagers,
    createWelcomeBanner,
    loggerTransports,
    service,
    setupBunchyConfig,
} from '@garage44/common/service'
import {hideBin} from 'yargs/helpers'
import yargs from 'yargs'
import {
    registerChannelsWebSocket,
} from './api/ws-channels'
import {registerChatWebSocket} from './api/ws-chat'
import {registerGroupsWebSocket} from './api/ws-groups'
import {registerPresenceWebSocket} from './api/ws-presence'
import {
    config,
    initConfig,
} from './lib/config.ts'
import {
    initDatabase,
    initializeDefaultData,
} from './lib/database.ts'
import {initMiddleware} from './lib/middleware.ts'

const pyriteDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(pyriteDir, path.join(pyriteDir, 'package.json'))

function welcomeBanner(): string {
    return createWelcomeBanner('Pyrite', 'Efficient communication for automated teams...', runtime.version)
}

// In case we start in development mode.
let bunchyConfig = null

const logger = loggerTransports(config.logger, 'service')

const BUN_ENV = process.env.BUN_ENV || 'production'

const cli = yargs(hideBin(process.argv))
cli.scriptName('pyrite')

if (BUN_ENV === 'development') {
    bunchyConfig = setupBunchyConfig({
        logPrefix: 'P',
        reloadIgnore: [],
        separateAssets: ['manifest.json', 'sw-loader.js', 'sw.js'],
        serviceDir: runtime.service_dir,
        version: runtime.version,
    })

    bunchyArgs(cli, bunchyConfig)
}

cli.usage('Usage: $0 [task]')
    .detectLocale(false)
    .command('start', 'Start the Pyrite service', (yargs): yargs.Argv<Record<string, never>> => {
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
                describe: 'port to run the Pyrite service on',
                type: 'number',
            })
            .option('cert', {
                describe: 'Path to TLS certificate file (.pem or .crt)',
                type: 'string',
            })
            .option('key', {
                describe: 'Path to TLS private key file (.pem or .key)',
                type: 'string',
            })
            .option('tls', {
                default: false,
                describe: 'Enable TLS/HTTPS',
                type: 'boolean',
            })
    }, async(argv): Promise<void> => {
        await initConfig(config)

        // Initialize database
        const database = initDatabase()

        /*
         * Initialize common service (including UserManager) with database
         * This creates the default admin user if it doesn't exist
         * Use environment variable for config path if set (for PR deployments)
         */
        const configPath = process.env.CONFIG_PATH || '~/.pyriterc'
        await service.init({appName: 'pyrite', configPath, useBcrypt: false}, database)

        /*
         * Initialize Pyrite-specific default data (channels, etc.)
         * Must run AFTER service.init() so that the admin user exists
         */
        await initializeDefaultData()

        // Initialize middleware and WebSocket server (after UserManager is initialized)
        const {handleRequest} = await initMiddleware(bunchyConfig)

        // Create WebSocket managers
        const {bunchyManager, wsManager} = createWebSocketManagers(config.authOptions, config.sessionMiddleware)

        // Map of endpoint to manager for the handler
        const wsManagers = new Map([
            ['/ws', wsManager],
            ['/bunchy', bunchyManager],
        ])

        const enhancedWebSocketHandler = createBunWebSocketHandler(wsManagers)

        // Register WebSocket API routes
        registerChatWebSocket(wsManager)
        registerGroupsWebSocket(wsManager)
        registerPresenceWebSocket(wsManager)
        registerChannelsWebSocket(wsManager)

        // Configure TLS if certificates are provided
        let tlsOptions = null
        if (argv.cert && argv.key) {
            try {
                const certFile = Bun.file(argv.cert)
                const keyFile = Bun.file(argv.key)
                if (await certFile.exists() && await keyFile.exists()) {
                    tlsOptions = {
                        cert: await certFile.text(),
                        key: await keyFile.text(),
                    }
                } else {
                    logger.warn(`[TLS] Certificate files not found: cert=${argv.cert}, key=${argv.key}`)
                }
            } catch(error: unknown) {
                const message = error instanceof Error ? error.message : String(error)
                logger.error(`[TLS] Failed to load certificate files: ${message}`)
            }
        }

        // Start Bun.serve server
        const server = Bun.serve({
            fetch: (req, server): Promise<Response> | Response => {
                const url = new URL(req.url)
                if (url.pathname === '/dev/snapshot') {
                    return new Response(JSON.stringify(devContext.snapshot({
                        version: runtime.version,
                        workspace: 'pyrite',
                    })), {headers: {'Content-Type': 'application/json'}})
                }
                return handleRequest(req, server)
            },
            hostname: argv.host,
            port: argv.port,
            websocket: enhancedWebSocketHandler,
            ...tlsOptions ? {tls: tlsOptions} : {},
        })

        if (BUN_ENV === 'development') {
            await bunchyService(server, bunchyConfig, bunchyManager)
        }

        logger.info(`service: ${tlsOptions ? 'https' : 'http'}://${argv.host}:${argv.port}`)
    })
    .demandCommand()
    .help('help')
    .showHelpOnFail(true)
cli.parse()

export {
    logger,
    runtime,
}
