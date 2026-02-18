#!/usr/bin/env bun
import type {LoggerConfig} from '@garage44/common/types'

import {bunchyArgs, bunchyService} from '@garage44/bunchy'
import {getApps} from '@garage44/common/lib/codebrew-registry'
import {createBunWebSocketHandler} from '@garage44/common/lib/ws-server'
import {
    createRuntime,
    createWelcomeBanner,
    setupBunchyConfig,
    createWebSocketManagers,
    service,
    loggerTransports,
} from '@garage44/common/service'
import {initDatabase} from '@garage44/nonlinear/lib/database'
import {homedir} from 'node:os'
import path from 'node:path'
import {URL, fileURLToPath} from 'node:url'
import pc from 'picocolors'
import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'

import {config, initConfig} from './lib/config'
import {initMiddleware} from './lib/middleware'
import {getPluginColor} from './lib/plugins'

export const serviceDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(serviceDir, path.join(serviceDir, 'package.json'))

function welcomeBanner(): string {
    const plugins = getApps()
    const lines = plugins.map((p): string => {
        const color = getPluginColor(p.id)
        return ` - ${color(p.name)}${p.description ? ` - ${p.description}` : ''}`
    })
    return `${createWelcomeBanner('Codebrew', 'Unified workspace', runtime.version).trimEnd()}
 ${pc.gray('Plugins:')}
${lines.map((l): string => ` ${l}`).join('\n')}
`
}

type BunchyConfig = ReturnType<typeof setupBunchyConfig>
let bunchyConfig: BunchyConfig | null = null

const logger = loggerTransports(config.logger as LoggerConfig, 'service')

const BUN_ENV = process.env.BUN_ENV || 'production'

const cli = yargs(hideBin(process.argv))
cli.scriptName('codebrew')

if (BUN_ENV === 'development') {
    bunchyConfig = setupBunchyConfig({
        debug: process.env.BUNCHY_DEBUG === '1',
        logPrefix: 'C',
        quiet: true,
        serviceDir: runtime.service_dir,
        version: runtime.version,
    })

    bunchyArgs(cli as Parameters<typeof bunchyArgs>[0], bunchyConfig)
}

void cli
    .usage('Usage: $0 [task]')
    .detectLocale(false)
    .command(
        'start',
        'Start the Codebrew service',
        // @ts-expect-error - yargs overload resolution doesn't match builder function signature
        (yargs) =>
            yargs
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
                }),
        async (argv: {host: string; port: number}) => {
            const {getApps} = await import('@garage44/common/lib/codebrew-registry')
            const {loadPlugins} = await import('./lib/plugins')
            await loadPlugins()

            // oxlint-disable-next-line no-console
            console.log(welcomeBanner())

            logger.info('initialized')
            for (const plugin of getApps()) {
                plugin.onInit?.()
            }

            await initConfig()

            const dbPath = process.env.DB_PATH || path.join(homedir(), '.codebrew.db')
            const database = initDatabase(dbPath, logger)

            const configPath = process.env.CONFIG_PATH || '~/.codebrewrc'
            await service.init({appName: 'codebrew', configPath, useBcrypt: false}, database)

            const {handleRequest, sessionMiddleware} = await initMiddleware(bunchyConfig)

            const {bunchyManager, wsManager} = createWebSocketManagers(undefined, sessionMiddleware)

            // Register WebSocket routes from each plugin
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

export {logger, runtime}
