import {URL, fileURLToPath} from 'node:url'
import {generateRandomId, showConfig} from './utils'
import {Logger} from '@garage44/common/lib/logger'
import type {MessageData} from '@garage44/common/lib/ws-server'
import path from 'node:path'
import {tasks} from './tasks'
import {devContext} from '@garage44/common/lib/dev-context'

const logger = new Logger()

// Import the real broadcast function - will be set during bunchyService initialization
let broadcastFn: ((url: string, data: MessageData, method?: string) => void) | null = null

const currentDir = fileURLToPath(new URL('.', import.meta.url))

interface Settings {
    buildId: string
    dir: {
        assets: string
        bunchy: string
        common: string
        components: string
        css: string
        public: string
        src: string
        workspace: string
    }
    minify?: boolean
    reload_ignore: string[]
    separateAssets?: string[]
    sourcemap?: boolean
    sourceMap?: boolean
    version?: string
}

const settings = {} as Settings
const tooling = {} as {css: (options: {entrypoint: string; minify?: boolean; outFile: string; sourcemap?: boolean}) => Promise<string>}

interface Config {
    common: string
    minify?: boolean
    reload_ignore: string[]
    separateAssets?: string[]
    sourcemap?: boolean
    version: string
    workspace: string
}

function applySettings(config: Config): void {
    Object.assign(settings, {
        buildId: generateRandomId(),
        dir: {
            assets: path.resolve(path.join(config.workspace, 'src', 'assets')),
            bunchy: currentDir,
            common: config.common,
            components: path.resolve(path.join(config.workspace, 'src', 'components')),
            css: path.resolve(path.join(config.workspace, 'src', 'css')),
            public: path.resolve(path.join(config.workspace, 'public')),
            src: path.resolve(path.join(config.workspace, 'src')),
            workspace: config.workspace,
        },
        minify: config.minify,
        reload_ignore: config.reload_ignore,
        separateAssets: config.separateAssets,
        sourcemap: config.sourcemap,
        version: config.version,
    })

    showConfig(settings)
}

interface WsManager {
    api?: {
        post?: (path: string, handler: (ctx: unknown, req: {data?: unknown}) => Promise<unknown>, middlewares?: unknown[]) => void
    }
    broadcast: (url: string, data: MessageData, method?: string) => void
}

async function bunchyService(server: unknown, config: Config, wsManager?: WsManager): Promise<unknown> {
    applySettings(config)

    // Set up broadcast function if WebSocket manager is provided
    if (wsManager) {
        broadcastFn = (url: string, data: MessageData, method = 'POST'): void => {
            wsManager.broadcast(url, data, method)
        }
        logger.info('[bunchy] connected to WebSocket broadcast system')

        // Set up log forwarding route
        setupLogForwarding(wsManager)
    } else {
        logger.warn('[bunchy] no WebSocket manager provided - broadcasts will be disabled')
    }

    logger.info('[bunchy] Development service ready')

    await tasks.dev.start({minify: false, sourcemap: true})
    return server
}

interface YargsInstance {
    argv: {minify?: boolean; sourcemap?: boolean}
    command: (command: string, description: string, handler: (yargs: YargsInstance) => void) => YargsInstance
    option: (name: string, options: {default: boolean | string; description?: string; describe?: string; type: string}) => YargsInstance
}

function bunchyArgs(yargs: YargsInstance, config: Config): YargsInstance {
    applySettings(config)

    yargs.option('minify', {
        default: false,
        description: '[Bunchy] Minify output',
        type: 'boolean',
    }).option('sourcemap', {
        default: true,
        description: '[Bunchy] Include source mapping',
        type: 'boolean',
    }).option('builddir', {
        default: '',
        describe: '[Bunchy] Directory to build to',
        type: 'string',
    }).command('build', '[Bunchy] build application', (yargs: YargsInstance): void => {
        applySettings({...config, minify: yargs.argv.minify, sourcemap: yargs.argv.sourcemap})
        tasks.build.start({minify: true, sourcemap: true})
    }).command('code_backend', '[Bunchy] bundle backend javascript', (yargs: YargsInstance): void => {
        applySettings({...config, minify: yargs.argv.minify, sourcemap: yargs.argv.sourcemap})
        tasks.code_backend.start({minify: true, sourcemap: true})
    }).command('code_frontend', '[Bunchy] bundle frontend javascript', (yargs: YargsInstance): void => {
        applySettings({...config, minify: yargs.argv.minify, sourcemap: yargs.argv.sourcemap})
        tasks.code_frontend.start({minify: true, sourcemap: true})
    }).command('html', '[Bunchy] build html file', (yargs: YargsInstance): void => {
        applySettings({...config, minify: yargs.argv.minify, sourcemap: yargs.argv.sourcemap})
        tasks.html.start({minify: true, sourcemap: true})
    }).command('styles', '[Bunchy] bundle styles', (yargs: YargsInstance): void => {
        applySettings({...config, minify: yargs.argv.minify, sourcemap: yargs.argv.sourcemap})
        tasks.styles.start({minify: true, sourcemap: true})
    })

    return yargs
}

// For backward compatibility, re-export connections from the manager
const connections = {
    add: (ws: WebSocket): void => {
        logger.info('[bunchy] WebSocket connection added')
    },
    delete: (ws: WebSocket): void => {
        logger.info('[bunchy] WebSocket connection removed')
    },
    has: (_ws: WebSocket): boolean => false,
    get size(): number {
        return 0
    },
} as Set<WebSocket>

// For backward compatibility, re-export broadcast from the manager
const broadcast = (url: string, data: MessageData, method = 'POST'): void => {
    if (broadcastFn) {
        broadcastFn(url, data, method)
        logger.debug('[bunchy] Broadcast sent:', url, data, method)
    } else {
        logger.warn('[bunchy] Broadcast attempted but WebSocket not connected:', url, data, method)
    }
}

// Set up log forwarding from client to server
function setupLogForwarding(wsManager: WsManager): void {
    if (!wsManager.api?.post) {
        return
    }
    wsManager.api.post('/logs/forward', async (_ctx: unknown, req: {data?: unknown}): Promise<{status: string}> => {
        const {args, level, message, source, timestamp} = req.data as {
            args: string[]
            level: string
            message: string
            source: string
            timestamp: string
        }

        // Format the log message for server output
        const formattedMessage = `[BROWSER] ${message}`
        const formattedArgs = args && args.length > 0 ? args : []

        // Log using the server logger with appropriate level
        try {
            devContext.addLog('remote', `${formattedMessage} ${formattedArgs.join(' ')}`)
        } catch {
            // Ignore errors in dev context logging
        }
        switch (level) {
            case 'error': { 
                logger.remote(formattedMessage, ...formattedArgs)
                break
            }
            
            case 'warn': { 
                logger.remote(formattedMessage, ...formattedArgs)
                break
            }
            
            case 'info': { 
                logger.remote(formattedMessage, ...formattedArgs)
                break
            }
            
            case 'success': { 
                logger.remote(formattedMessage, ...formattedArgs)
                break
            }
            
            case 'verbose': { 
                logger.remote(formattedMessage, ...formattedArgs)
                break
            }
            
            case 'debug': { 
                logger.remote(formattedMessage, ...formattedArgs)
                break
            }
            
            default: { 
                logger.remote(formattedMessage, ...formattedArgs)
            }
            
        }

        return {status: 'ok'}
    })
}

/**
 * Wrap a fetch handler to automatically handle Bunchy WebSocket upgrades
 * This should be used BEFORE Bun.serve() is called
 */
interface Server {
    upgrade?: (request: Request, options: {data: {endpoint: string}}) => boolean
}

function wrapFetchHandler(fetchHandler: (request: Request, server: Server) => Response | Promise<Response>): (request: Request, server: Server) => Promise<Response> {
    return async (request: Request, server: Server): Promise<Response> => {
        try {
            const url = new URL(request.url)

            // Handle WebSocket upgrade requests for /bunchy FIRST
            if (url.pathname === '/bunchy') {
                if (server && typeof server.upgrade === 'function') {
                    const success = server.upgrade(request, {
                        data: {
                            endpoint: '/bunchy',
                        },
                    })
                    if (success) {
                        return new Response(null, {status: 101}) // Return 101 Switching Protocols to indicate upgrade success
                    }
                    return new Response('WebSocket upgrade failed', {status: 400})
                }
                return new Response('WebSocket server not available', {status: 500})
            }
        } catch (error) {
            logger.error(`[bunchy] Error in fetch wrapper: ${error}`)
        }
        // Call original fetch handler
        return fetchHandler(request, server)
    }
}

export {
    bunchyArgs,
    bunchyService,
    broadcast,
    connections,
    logger,
    settings,
    tooling,
    wrapFetchHandler,
}