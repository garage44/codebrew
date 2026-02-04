import {EventEmitter} from 'node:events'
import {constructMessage, type WebSocketMessage} from './ws-client'
import {devContext} from './dev-context'
import {logger} from './logger'
import {match} from 'path-to-regexp'

// Core types for the middleware system
type MessageData = Record<string, unknown>
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface WebSocketContext {
    broadcast: (url: string, data: MessageData, method?: string) => void
    method: HttpMethod
    session?: {
        [key: string]: unknown
        userid: string
    }
    subscribe?: (topic: string) => void
    unsubscribe?: (topic: string) => void
    url: string
    // Bun WebSocket or standard WebSocket
    ws: WebSocket | {close: (code?: number, reason?: string) => void; readyState: number; send: (data: string) => void}
}

interface ApiRequest {
    data?: MessageData
    id?: string
    params: Record<string, string>
    query?: Record<string, unknown>
}

type Next = (ctx: WebSocketContext) => Promise<unknown>
type Middleware = (ctx: WebSocketContext, next: Next) => Promise<unknown>
type ApiHandler = (ctx: WebSocketContext, request: ApiRequest) => Promise<unknown>

interface RouteHandler {
    handler: ApiHandler
    matchFn: (path: string) => false | {params: Record<string, string>}
    method: HttpMethod
    middlewares: Middleware[]
    route: string
}

interface WebSocketServerOptions {
    authOptions?: {
        noSecurityEnv?: string
        users?: {[key: string]: unknown; name: string}[]
    }
    endpoint: string
    globalMiddlewares?: Middleware[]
    sessionMiddleware?: (request: Request) => {session: {userid?: string}; sessionId: string}
}

/**
 * WebSocket Server Manager - handles a single WebSocket endpoint
 */
type WebSocketConnection = WebSocket | {
    close: (code?: number, reason?: string) => void
    readyState: number
    send: (data: string) => void
}

class WebSocketServerManager extends EventEmitter {
    connections = new Set<WebSocketConnection>()

    routeHandlers: RouteHandler[] = []

    subscriptions: Record<string, Set<WebSocketConnection>> = {}

    clientSubscriptions = new WeakMap<WebSocketConnection, Set<string>>()

    endpoint: string

    authOptions?: WebSocketServerOptions['authOptions']

    sessionMiddleware?: (request: Request) => {session: {userid?: string}; sessionId: string}

    // Global middlewares that will be applied to all routes
    globalMiddlewares: Middleware[] = [
        // Logging middleware
        async(ctx, next) => {
            const startTime = Date.now()
            try {
                const result = await next(ctx)
                logger.debug(`${ctx.method} ${ctx.url} - ${Date.now() - startTime}ms`)
                return result
            } catch(error) {
                // Suppress error logs during tests (expected errors from error handling tests)
                const isTest = typeof process !== 'undefined' && (
                    process.env.NODE_ENV === 'test' ||
                    process.env.BUN_ENV === 'test' ||
                    process.argv.some((arg) => arg.includes('test'))
                )
                if (!isTest) {
                    logger.error(`${ctx.method} ${ctx.url} - Failed: ${error.message}`)
                }
                throw error
            }
        },
    ]

    api = {
        delete: (route: string, handler: ApiHandler, middlewares?: Middleware[]) => {
            return this.registerApi('DELETE', route, handler, middlewares)
        },
        get: (route: string, handler: ApiHandler, middlewares?: Middleware[]) => {
            return this.registerApi('GET', route, handler, middlewares)
        },
        post: (route: string, handler: ApiHandler, middlewares?: Middleware[]) => {
            return this.registerApi('POST', route, handler, middlewares)
        },
        put: (route: string, handler: ApiHandler, middlewares?: Middleware[]) => {
            return this.registerApi('PUT', route, handler, middlewares)
        },
    }

    constructor(options: WebSocketServerOptions) {
        super()
        this.endpoint = options.endpoint
        this.authOptions = options.authOptions
        this.sessionMiddleware = options.sessionMiddleware

        // Add custom global middlewares if provided
        if (options.globalMiddlewares) {
            this.globalMiddlewares.push(...options.globalMiddlewares)
        }
    }

    composeMiddleware(middlewares: Middleware[], handler: ApiHandler): ApiHandler {
        return (ctx, request) => {
            let index = -1

            const dispatch = (_index: number) => {
                if (_index <= index) {
                    throw new Error('next() called multiple times')
                }
                index = _index

                const middleware = _index === middlewares.length ?
                        (ctx) => handler(ctx, request) :
                    middlewares[_index]

                return middleware(ctx, (_ctx) => dispatch(_index + 1))
            }

            return dispatch(0)
        }
    }

    registerApi(method: HttpMethod, route: string, handler: ApiHandler, middlewares: Middleware[] = []) {
        logger.debug(`[WS] Registering route: ${method} ${route}`)
        const matchFn = match(route, {decode: decodeURIComponent})
        this.routeHandlers.push({
            handler: this.composeMiddleware([...this.globalMiddlewares, ...middlewares], handler),
            matchFn: (path: string) => {
                const result = matchFn(path)
                if (result === false) {
                    return false
                }

                const params: Record<string, string> = {}
                for (const [key, value] of Object.entries(result.params)) {
                    params[key] = Array.isArray(value) ? value[0] : value
                }
                return {params}
            },
            method,
            middlewares,
            route,
        })
    }

    // Subscription management
    subscribe(ws: WebSocketConnection, topic: string) {
        if (!this.subscriptions[topic]) {
            this.subscriptions[topic] = new Set()
        }
        this.subscriptions[topic].add(ws)

        if (!this.clientSubscriptions.has(ws)) {
            this.clientSubscriptions.set(ws, new Set())
        }
        this.clientSubscriptions.get(ws)!.add(topic)
    }

    unsubscribe(ws: WebSocketConnection, topic: string) {
        this.subscriptions[topic]?.delete(ws)
        this.clientSubscriptions.get(ws)?.delete(topic)
    }

    // Clean up subscriptions when connection closes
    cleanupSubscriptions(ws: WebSocketConnection) {
        const topics = this.clientSubscriptions.get(ws)
        if (topics) {
            for (const topic of topics) {
                this.subscriptions[topic]?.delete(ws)
            }
            this.clientSubscriptions.delete(ws)
        }
    }

    // Clean up dead connections (connections not in OPEN state)
    cleanupDeadConnections(): void {
        const deadConnections: WebSocketConnection[] = []
        for (const ws of this.connections) {
            if (ws.readyState !== 1) {
                deadConnections.push(ws)
            }
        }
        for (const ws of deadConnections) {
            this.connections.delete(ws)
            this.cleanupSubscriptions(ws)
        }
        if (deadConnections.length > 0) {
            logger.debug(`[WS] Cleaned up ${deadConnections.length} dead connection(s)`)
        }
    }

    // Broadcast a message to all connections
    broadcast(url: string, data: MessageData, method = 'POST') {
        const message = constructMessage(url, data, undefined, method)
        try {
            const dataPreview = JSON.stringify(message).slice(0, 200)
            devContext.addWs({
                dataPreview,
                endpoint: this.endpoint,
                ts: Date.now(),
                type: 'broadcast',
                url,
            })
        } catch {}
        const deadConnections: WebSocketConnection[] = []
        const messageStr = JSON.stringify(message)
        for (const ws of this.connections) {
            // OPEN state for Bun WebSocket
            if (ws.readyState === 1) {
                try {
                    ws.send(messageStr)
                } catch(error) {
                    logger.debug(`[WS] Failed to send broadcast to connection: ${error}`)
                    deadConnections.push(ws)
                }
            } else {
                deadConnections.push(ws)
            }
        }
        // Clean up dead connections
        for (const ws of deadConnections) {
            this.connections.delete(ws)
            this.cleanupSubscriptions(ws)
        }
    }

    // Emit event to subscribed connections
    emitEvent(topic: string, data: unknown): void {
        const message = constructMessage(topic, data as MessageData)
        const subscribers = this.subscriptions[topic]
        if (subscribers) {
            const messageStr = JSON.stringify(message)
            const deadConnections: WebSocketConnection[] = []
            for (const ws of subscribers) {
                // OPEN state
                if (ws.readyState === 1) {
                    try {
                        ws.send(messageStr)
                    } catch(error) {
                        logger.debug(`[WS] Failed to send event to subscribed connection: ${error}`)
                        deadConnections.push(ws)
                    }
                } else {
                    deadConnections.push(ws)
                }
            }
            // Clean up dead connections
            for (const ws of deadConnections) {
                subscribers.delete(ws)
                this.clientSubscriptions.get(ws)?.delete(topic)
            }
        }
    }

    // Check authentication for a request
    private checkAuth(request: {session?: {userid?: string}}): boolean {
        if (!this.authOptions) {
            return true
        }

        // Check if auth is bypassed via environment variable
        if (process.env[this.authOptions.noSecurityEnv || 'GARAGE44_NO_SECURITY']) {
            return true
        }

        // Check session
        if (!request.session?.userid) {
            return false
        }

        // Verify user exists if users list is provided
        if (this.authOptions.users && this.authOptions.users.length > 0) {
            const user = this.authOptions.users.find((u) => u.name === request.session.userid)
            return !!user
        }

        return true
    }

    // Handle WebSocket connection open
    open(ws: WebSocketConnection, request?: {session?: {userid?: string}}) {
        // Check authentication if required
        if (this.authOptions && !this.checkAuth(request)) {
            logger.warn(`[WS] connection denied (unauthorized) on ${this.endpoint}`)
            ws.close(1008, 'Unauthorized')
            return
        }

        logger.success(`[WS] connection established: ${this.endpoint}`)
        try {
            devContext.addWs({endpoint: this.endpoint, ts: Date.now(), type: 'open'})
        } catch {}
        this.connections.add(ws)
    }

    // Handle WebSocket connection close
    close(ws: WebSocketConnection) {
        logger.debug(`[WS] connection closed: ${this.endpoint}`)
        try {
            devContext.addWs({endpoint: this.endpoint, ts: Date.now(), type: 'close'})
        } catch {}
        this.connections.delete(ws)
        this.cleanupSubscriptions(ws)
        // Clean up any other dead connections while we're at it
        this.cleanupDeadConnections()
    }

    // Handle WebSocket message
    async message(ws: WebSocketConnection, message: string, request?: {session?: {userid?: string}}) {
        let parsedMessage: WebSocketMessage
        let _messageId: string | undefined

        try {
            parsedMessage = JSON.parse(message)
            _messageId = parsedMessage.id
        } catch(error) {
            // Send error response if we can
            try {
                const errorMsg = constructMessage('/error', {
                    error: 'Invalid JSON message',
                })
                ws.send(JSON.stringify(errorMsg))
            } catch {}
            // Log at debug level - this is expected for invalid messages
            logger.debug('[WS] Failed to parse message:', error)
            return
        }

        const {data, id, method = 'GET', url} = parsedMessage

        // Validate required fields
        if (!url) {
            try {
                const errorMsg = constructMessage('/error', {
                    error: 'Missing required field: url',
                }, id)
                ws.send(JSON.stringify(errorMsg))
            } catch {}
            // Log at debug level - this is expected for malformed messages
            logger.debug('[WS] Message missing url field')
            return
        }

        try {
            const dataPreview = JSON.stringify({data, id, method, url}).slice(0, 200)
            devContext.addWs({
                dataPreview,
                endpoint: this.endpoint,
                ts: Date.now(),
                type: 'message',
                url,
            })
        } catch {}

        // Parse query parameters from URL (once, before route matching)
        let queryParams: Record<string, unknown> = {}
        let pathname = url
        try {
            // URL might be a path like '/api/docs' or full URL like 'http://example.com/api/docs?tags=foo'
            const urlObj = url.startsWith('http') ? new URL(url) : new URL(url, 'http://localhost')
            pathname = urlObj.pathname
            // URLSearchParams automatically decodes values
            queryParams = Object.fromEntries(urlObj.searchParams.entries())
        } catch(_error) {
            // If URL parsing fails, try to extract query string manually
            const queryMatch = url.match(/^([^?]+)(\?.+)?$/)
            if (queryMatch) {
                pathname = queryMatch[1]
                if (queryMatch[2]) {
                    const searchParams = new URLSearchParams(queryMatch[2].slice(1))
                    queryParams = Object.fromEntries(searchParams.entries())
                }
            }
        }

        // Create context for this request
        const ctx: WebSocketContext = {
            broadcast: this.broadcast.bind(this),
            method: method as HttpMethod,
            session: request?.session as {[key: string]: unknown; userid: string} | undefined,
            subscribe: (topic: string) => this.subscribe(ws, topic),
            unsubscribe: (topic: string) => this.unsubscribe(ws, topic),
            url,
            ws,
        }

        // Find matching route handler
        let matched = false
        for (const {handler, matchFn, method: handlerMethod} of this.routeHandlers) {
            const matchResult = matchFn(pathname)

            // Check both URL pattern match AND matching HTTP method
            if (matchResult !== false && handlerMethod === method) {
                matched = true
                try {
                    const request: ApiRequest = {
                        data,
                        id,
                        params: matchResult.params,
                        query: queryParams || {},
                    }

                    const result = await handler(ctx, request)
                    // Always respond to messages with an ID
                    if (id) {
                        try {
                            const response = constructMessage(url, (result as MessageData) || null, id)
                            ws.send(JSON.stringify(response))
                        } catch(sendError) {
                            logger.error('[WS] Failed to send response:', sendError)
                        }
                    }
                } catch(error) {
                    try {
                        const errorResponse = constructMessage(
                            url,
                            {error: error instanceof Error ? error.message : String(error)},
                            id,
                        )
                        ws.send(JSON.stringify(errorResponse))
                    } catch(sendError) {
                        logger.error('[WS] Failed to send error response:', sendError)
                    }
                    // Suppress handler error logs during tests (expected errors from error handling tests)
                    const isTest = typeof process !== 'undefined' && (
                        process.env.NODE_ENV === 'test' ||
                        process.env.BUN_ENV === 'test' ||
                        process.argv.some((arg) => arg.includes('test'))
                    )
                    if (!isTest) {
                        logger.error('handler error:', error)
                    }
                }
                break
            }
        }

        if (!matched && id) {
            // Send error response for unmatched routes
            try {
                const errorResponse = constructMessage(url, {
                    error: `No route matched for: ${method} ${url}`,
                }, id)
                ws.send(JSON.stringify(errorResponse))
            } catch(sendError) {
                logger.error('[WS] Failed to send no-route error:', sendError)
            }
        } else if (!matched) {
            logger.debug(`[WS] No route matched for: ${method} ${url}`)
        }
    }
}

// Create Bun.serve compatible WebSocket handlers that dispatch to multiple managers
function createBunWebSocketHandler(managers: Map<string, WebSocketServerManager>) {
    return {
        close: (ws: WebSocketConnection & {data?: {endpoint?: string; proxy?: boolean; upstream?: WebSocket}}) => {
            // Handle proxy connections (forward close to upstream)
            if (ws.data?.proxy && ws.data?.upstream) {
                try {
                    ws.data.upstream.close()
                } catch(error) {
                    logger.debug(`[WS Proxy] Error closing upstream connection: ${error}`)
                }
                return
            }

            const endpoint = ws.data?.endpoint
            const manager = managers.get(endpoint)
            if (manager) {
                manager.close(ws)
            }
        },
        message: (
            ws: WebSocketConnection & {data?: {endpoint?: string; proxy?: boolean; upstream?: WebSocket}},
            message: string,
        ) => {
            // Handle proxy connections (forward message to upstream)
            if (ws.data?.proxy && ws.data?.upstream) {
                try {
                    ws.data.upstream.send(message)
                } catch(error) {
                    logger.error(`[WS Proxy] Error forwarding message: ${error}`)
                }
                return
            }

            const endpoint = ws.data?.endpoint
            const manager = managers.get(endpoint)
            if (manager) {
                manager.message(ws, message, ws.data as {session?: {userid?: string}})
            }
        },
        open: (ws: WebSocketConnection & {data?: {endpoint?: string; proxy?: boolean; upstream?: WebSocket}}) => {
            // Handle proxy connections (set up bidirectional forwarding)
            if (ws.data?.proxy && ws.data?.upstream) {
                const upstream = ws.data.upstream

                // Forward messages from upstream to client
                upstream.onmessage = (event: MessageEvent) => {
                    try {
                        // WebSocket.OPEN
                        if (ws.readyState === 1) {
                            ws.send(event.data)
                        }
                    } catch(error) {
                        logger.error(`[WS Proxy] Error forwarding message from upstream: ${error}`)
                    }
                }

                // Forward errors and close events
                upstream.onerror = (error: Event) => {
                    logger.error(`[WS Proxy] Upstream connection error: ${error}`)
                    try {
                        ws.close(1011, 'Upstream Error')
                    } catch(_e) {
                        // Connection may already be closed
                    }
                }

                upstream.onclose = (event: CloseEvent) => {
                    logger.debug(`[WS Proxy] Upstream connection closed: ${event.code} ${event.reason}`)
                    try {
                        ws.close(event.code || 1000, event.reason || 'Upstream Closed')
                    } catch(_e) {
                        // Connection may already be closed
                    }
                }

                logger.info(`[WS Proxy] Proxy connection established for ${ws.data?.endpoint || 'unknown'}`)
                return
            }

            // Normal manager-based handling
            const endpoint = ws.data?.endpoint
            const manager = managers.get(endpoint)
            if (manager) {
                manager.open(ws, ws.data as {session?: {userid?: string}})
            } else {
                logger.error(`[WS] no manager found for endpoint: ${endpoint}`)
                ws.close(1011, 'Server Error')
            }
        },
    }
}

/*
 * Note: broadcast, emitEvent, and connections are now managed per WebSocketServerManager instance
 * Each package should use their own manager instances directly
 */

// Legacy exports for backward compatibility
type SubscriptionContext = WebSocketContext
const RouteTypes = {API: 'api'} as const

export {
    createBunWebSocketHandler,
    RouteTypes,
    SubscriptionContext,
    WebSocketServerManager,
    type ApiRequest,
    type ApiHandler,
    type HttpMethod,
    type MessageData,
    type Middleware,
    type Next,
    type RouteHandler,
    type WebSocketContext,
    type WebSocketServerOptions,
}
