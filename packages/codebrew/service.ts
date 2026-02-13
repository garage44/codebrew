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
import type {LoggerConfig} from '@garage44/common/types'
import {homedir} from 'node:os'
import path from 'node:path'
import {hideBin} from 'yargs/helpers'
import yargs from 'yargs'

import {initDatabase} from '@garage44/nonlinear/lib/database'
import {initMiddleware} from './lib/middleware'
import {config, initConfig} from './lib/config'
import './lib/plugins'

export const serviceDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(serviceDir, path.join(serviceDir, 'package.json'))

function welcomeBanner() {
    return createWelcomeBanner('Codebrew', 'Pyrite, Nonlinear, Expressio - unified', runtime.version)
}

type BunchyConfig = ReturnType<typeof setupBunchyConfig>
let bunchyConfig: BunchyConfig | null = null

const logger = loggerTransports(config.logger as LoggerConfig, 'service')

const BUN_ENV = process.env.BUN_ENV || 'production'

const cli = yargs(hideBin(process.argv))
cli.scriptName('codebrew')

if (BUN_ENV === 'development') {
    bunchyConfig = setupBunchyConfig({
        logPrefix: 'C',
        serviceDir: runtime.service_dir,
        version: runtime.version,
    })

    bunchyArgs(cli as Parameters<typeof bunchyArgs>[0], bunchyConfig)
}

void cli.usage('Usage: $0 [task]')
    .detectLocale(false)
    .command(
        'start',
        'Start the Codebrew service',
        // @ts-expect-error - yargs overload resolution doesn't match builder function signature
        (yargs) => {
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
                    default: 3033,
                    describe: 'port to run the Codebrew service on',
                    type: 'number',
                })
        },
        async (argv: {host: string; port: number}) => {
        await initConfig()

        const dbPath = process.env.DB_PATH || path.join(homedir(), '.codebrew.db')
        const database = initDatabase(dbPath)

        const configPath = process.env.CONFIG_PATH || '~/.codebrewrc'
        await service.init({appName: 'codebrew', configPath, useBcrypt: false}, database)

        const {handleRequest, sessionMiddleware} = await initMiddleware(bunchyConfig)

        const {bunchyManager, wsManager} = createWebSocketManagers(undefined, sessionMiddleware)

        // Register WebSocket routes from each plugin
        const {getApps} = await import('@garage44/common/lib/codebrew-registry')
        for (const plugin of getApps()) {
            if (plugin.wsRoutes) {
                plugin.wsRoutes(wsManager)
            }
        }

        const wsManagers = new Map([
            ['/ws', wsManager],
            ['/bunchy', bunchyManager],
        ])

        const enhancedWebSocketHandler = createBunWebSocketHandler(wsManagers)

        const server = Bun.serve({
            fetch: async (req, srv) => {
                const res = await handleRequest(req, srv)
                return res ?? new Response('Not Found', {status: 404})
            },
            hostname: argv.host,
            port: argv.port,
            websocket: enhancedWebSocketHandler,
        })

        if (BUN_ENV === 'development' && bunchyConfig) {
            // @ts-expect-error - Bun Server type doesn't match bunchy's expected signature
            await bunchyService(server, bunchyConfig, bunchyManager)
        }

        logger.info(`service: http://${argv.host}:${argv.port}`)
        },
    )
    .demandCommand()
    .help('help')
    .showHelpOnFail(true)
    .parse()

export {
    logger,
    runtime,
}
