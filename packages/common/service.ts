import type {Database} from 'bun:sqlite'

import figlet from 'figlet'
import fs from 'fs-extra'
import path from 'node:path'
import pc from 'picocolors'

import type {LoggerConfig} from './types.ts'

import {Logger} from './lib/logger.ts'
import {UserManager} from './lib/user-manager.ts'
import {WebSocketServerManager} from './lib/ws-server.ts'

function serviceLogger(logger_config: LoggerConfig): InstanceType<typeof Logger> {
    return new Logger(logger_config)
}

function loggerTransports(logger_config: LoggerConfig, type: 'cli' | 'service'): InstanceType<typeof Logger> {
    if (type === 'cli') {
        // CLI mode: console only, no timestamps, colors enabled
        return new Logger({
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
async function tryPublicFile(baseDir: string, pathname: string, logger: unknown): Promise<Response | null> {
    const publicPath = path.join(baseDir, 'public', pathname)
    const publicFile = Bun.file(publicPath)
    if (await publicFile.exists()) {
        ;(logger as {debug?: (msg: string) => void})?.debug?.(`[static] serving from public: ${publicPath}`)
        return new Response(publicFile)
    }
    return null
}

async function tryFallbackDirs(
    baseDir: string,
    pathname: string,
    fallbackDirs: string[],
    logger: unknown,
): Promise<Response | null> {
    const checks = fallbackDirs.map(async (fallbackDir: string): Promise<Response | null> => {
        const fallbackPath = path.join(baseDir, fallbackDir, pathname)
        const fallbackFile = Bun.file(fallbackPath)
        if (await fallbackFile.exists()) {
            ;(logger as {debug?: (msg: string) => void})?.debug?.(`[static] serving from ${fallbackDir}: ${fallbackPath}`)
            return new Response(fallbackFile)
        }
        return null
    })
    const results = await Promise.all(checks)
    for (const result of results) {
        if (result) {
            return result
        }
    }
    return null
}

async function trySpaFallback(baseDir: string, pathname: string, spaFallback: boolean): Promise<Response | null> {
    if (spaFallback && !pathname.startsWith('/api') && !pathname.includes('.')) {
        const indexPath = path.join(baseDir, 'public', 'index.html')
        const indexFile = Bun.file(indexPath)
        if (await indexFile.exists()) {
            return new Response(indexFile, {
                headers: {'Content-Type': 'text/html'},
            })
        }
    }
    return null
}

function createStaticFileHandler(
    options: StaticFileServerOptions,
): (request: Request, pathname: string) => Promise<Response | null> {
    const {baseDir, fallbackDirs = [], logger, spaFallback = true} = options

    // eslint-disable-next-line max-statements
    return async (request: Request, pathname: string): Promise<Response | null> => {
        // Default to index.html for root
        const normalizedPathname = pathname === '/' ? '/index.html' : pathname

        // Try public directory first (built files)
        const publicResponse = await tryPublicFile(baseDir, normalizedPathname, logger)
        if (publicResponse) {
            return publicResponse
        }

        // Try fallback directories (e.g., src for development)
        const fallbackResponse = await tryFallbackDirs(baseDir, normalizedPathname, fallbackDirs, logger)
        if (fallbackResponse) {
            return fallbackResponse
        }

        // SPA fallback - serve index.html for unmatched routes (except API calls)
        const spaResponse = await trySpaFallback(baseDir, normalizedPathname, spaFallback)
        if (spaResponse) {
            return spaResponse
        }

        // No match found
        return null
    }
}

/**
 * Adds SPA fallback to a file serving response
 * If the original response is 404 and the request looks like a page route, serve index.html instead
 */
// eslint-disable-next-line max-statements
async function withSpaFallback(originalResponse: Response, request: Request, baseDir: string): Promise<Response> {
    // If we got a successful response, return it as-is
    if (originalResponse.status !== 404) {
        return originalResponse
    }

    const url = new URL(request.url)
    const {pathname} = url

    /*
     * Don't apply SPA fallback to:
     * - API routes
     * - File extensions (assets)
     * - WebSocket endpoints
     */
    if (pathname.startsWith('/api') || pathname.includes('.') || pathname.startsWith('/bunchy') || pathname.startsWith('/ws')) {
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
export function createRuntime(serviceDir: string, packageJsonPath: string): {service_dir: string; version: string} {
    return {
        service_dir: serviceDir,
        version: JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version,
    }
}

export function createWelcomeBanner(title: string, tagline: string, version: string): string {
    return `
${pc.cyan(figlet.textSync(title))}\n
 ${pc.white(pc.bold(tagline))}
 ${pc.gray(`v${version}`)}
`
}

export interface BunchyConfigOptions {
    debug?: boolean
    logPrefix: string
    quiet?: boolean
    reloadIgnore?: string[]
    separateAssets?: string[]
    serviceDir: string
    version: string
}

export function setupBunchyConfig(options: BunchyConfigOptions): {
    common: string
    debug?: boolean
    logPrefix: string
    quiet?: boolean
    reload_ignore: string[]
    separateAssets?: string[]
    version: string
    workspace: string
} {
    const {logPrefix, quiet, reloadIgnore = [], separateAssets, serviceDir, version} = options
    const debug = options.debug ?? process.env.BUNCHY_DEBUG === '1'

    return {
        common: path.resolve(serviceDir, '../', 'common'),
        debug,
        logPrefix,
        quiet,
        reload_ignore: reloadIgnore,
        separateAssets,
        version,
        workspace: serviceDir,
    }
}

export function createWebSocketManagers(
    authOptions: {noSecurityEnv?: string; users?: {[key: string]: unknown; name: string}[]} | null | undefined,
    sessionMiddleware: (request: Request) => {session: {userid?: string}; sessionId: string},
): {bunchyManager: WebSocketServerManager; wsManager: WebSocketServerManager} {
    const wsManager = new WebSocketServerManager({
        authOptions: authOptions as {noSecurityEnv?: string; users?: {[key: string]: unknown; name: string}[]} | undefined,
        endpoint: '/ws',
        sessionMiddleware,
    })

    const bunchyManager = new WebSocketServerManager({
        authOptions: authOptions as {noSecurityEnv?: string; users?: {[key: string]: unknown; name: string}[]} | undefined,
        endpoint: '/bunchy',
        sessionMiddleware,
    })

    return {bunchyManager, wsManager}
}

// Shared UserManager instance
export const userManager = new UserManager()

// Service initialization
export const service = {
    async init(config: {appName: string; configPath: string; useBcrypt?: boolean}, database?: Database): Promise<void> {
        if (database) {
            await userManager.init(database, config)
        }
    },
}

export {createStaticFileHandler, loggerTransports, serviceLogger, withSpaFallback}
