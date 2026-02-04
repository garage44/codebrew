import {Logger} from './lib/logger.ts'
import type {LoggerConfig} from './types.ts'
import {UserManager} from './lib/user-manager.ts'
import {WebSocketServerManager} from './lib/ws-server.ts'
import figlet from 'figlet'
import fs from 'fs-extra'
import path from 'node:path'
import pc from 'picocolors'

function serviceLogger(logger_config: LoggerConfig) {
    return new Logger(logger_config)
}

function loggerTransports(logger_config: LoggerConfig, type: 'cli' | 'service') {
    if (type === 'cli') {
        // CLI mode: console only, no timestamps, colors enabled
        return new Logger({
            file: undefined,
            level: logger_config.level || 'info',
        })
    }
    if (type === 'service') {
        // Service mode: console + file, timestamps enabled, colors enabled for console
        return new Logger({
            file: logger_config.file,
            level: logger_config.level || 'info',
        })
    }
    return new Logger({
        file: logger_config.file,
        level: logger_config.level,
    })
}

interface StaticFileServerOptions {
    /** Base directory for the service */
    baseDir: string
    /** Additional static directories to check (e.g., ['src'] for development) */
    fallbackDirs?: string[]
    /** Logger instance for debug output */
    logger?: unknown
    /** Enable SPA fallback (serve index.html for unmatched routes) */
    spaFallback?: boolean
}

/**
 * Creates a static file server handler for Bun.serve
 * Handles serving files from public directory with optional fallbacks and SPA routing
 */
function createStaticFileHandler(options: StaticFileServerOptions) {
    const {baseDir, fallbackDirs = [], logger, spaFallback = true} = options

    return async (request: Request, pathname: string): Promise<Response | null> => {
        // Default to index.html for root
        if (pathname === '/') {
            pathname = '/index.html'
        }

        // Try public directory first (built files)
        const publicPath = path.join(baseDir, 'public', pathname)
        const publicFile = Bun.file(publicPath)

        if (await publicFile.exists()) {
            (logger as any)?.debug(`[Static] Serving from public: ${publicPath}`)
            return new Response(publicFile)
        }

        // Try fallback directories (e.g., src for development)
        for (const fallbackDir of fallbackDirs) {
            const fallbackPath = path.join(baseDir, fallbackDir, pathname)
            const fallbackFile = Bun.file(fallbackPath)

            if (await fallbackFile.exists()) {
                (logger as any)?.debug(`[Static] Serving from ${fallbackDir}: ${fallbackPath}`)
                return new Response(fallbackFile)
            }
        }

        // SPA fallback - serve index.html for unmatched routes (except API calls)
        if (spaFallback && !pathname.startsWith('/api') && !pathname.includes('.')) {
            const indexPath = path.join(baseDir, 'public', 'index.html')
            const indexFile = Bun.file(indexPath)

            if (await indexFile.exists()) {
                return new Response(indexFile, {
                    headers: {'Content-Type': 'text/html'},
                })
            }
        }

        // No match found
        return null
    }
}

/**
 * Adds SPA fallback to a file serving response
 * If the original response is 404 and the request looks like a page route, serve index.html instead
 */
async function withSpaFallback(originalResponse: Response, request: Request, baseDir: string): Promise<Response> {
    // If we got a successful response, return it as-is
    if (originalResponse.status !== 404) {
        return originalResponse
    }

    const url = new URL(request.url)
    const pathname = url.pathname

    // Don't apply SPA fallback to:
    // - API routes
    // - File extensions (assets)
    // - WebSocket endpoints
    if (pathname.startsWith('/api') ||
        pathname.includes('.') ||
        pathname.startsWith('/bunchy') ||
        pathname.startsWith('/ws')) {
        return originalResponse
    }

    // Try to serve index.html for SPA routing
    const indexPath = path.join(baseDir, 'public', 'index.html')
    const indexFile = Bun.file(indexPath)

    if (await indexFile.exists()) {
        return new Response(indexFile, {
            headers: {'Content-Type': 'text/html'},
        })
    }

    // No index.html found, return original 404
    return originalResponse
}

// Common service utilities
export function createRuntime(serviceDir: string, packageJsonPath: string) {
    return {
        service_dir: serviceDir,
        version: JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version,
    }
}

export function createWelcomeBanner(title: string, tagline: string, version: string) {
    return `
${pc.cyan(figlet.textSync(title))}\n
 ${pc.white(pc.bold(tagline))}
 ${pc.gray(`v${version}`)}
`
}

export interface BunchyConfigOptions {
    logPrefix: string
    reloadIgnore?: string[]
    separateAssets?: string[]
    serviceDir: string
    version: string
}

export function setupBunchyConfig(options: BunchyConfigOptions) {
    const {
        logPrefix,
        reloadIgnore = [],
        separateAssets,
        serviceDir,
        version,
    } = options

    return {
        common: path.resolve(serviceDir, '../', 'common'),
        logPrefix,
        reload_ignore: reloadIgnore,
        separateAssets,
        version,
        workspace: serviceDir,
    }
}

export function createWebSocketManagers(
    authOptions: unknown,
    sessionMiddleware: (request: Request) => {session: {userid?: string}; sessionId: string}
) {
    const wsManager = new WebSocketServerManager({
        authOptions,
        endpoint: '/ws',
        sessionMiddleware,
    })

    const bunchyManager = new WebSocketServerManager({
        authOptions,
        endpoint: '/bunchy',
        sessionMiddleware,
    })

    return {bunchyManager, wsManager}
}

// Shared UserManager instance
export const userManager = new UserManager()

// Service initialization
export const service = {
    async init(config: {appName: string; configPath: string; useBcrypt?: boolean}, database?: any) {
        await userManager.init(database, config)
    },
}

export {
    createStaticFileHandler,
    loggerTransports,
    serviceLogger,
    withSpaFallback,
}