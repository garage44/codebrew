import path from 'node:path'

import {UserManager} from './user-manager'

// Configuration interface for package-specific middleware behavior
export interface MiddlewareConfig {
    configPath: string
    customWebSocketHandlers?: Array<{
        handler: (request: Request, server: unknown) => Promise<Response | undefined>
        path: string
    }>
    endpointAllowList: string[]
    packageName: string
    sessionCookieName: string
}

// Create a simple session store for Bun.serve
const sessions = new Map()

// Track which user index each session should get (for cycling through users in no-security mode)
const sessionUserIndex = new Map<string, number>()

// Track how many sessions have been created (for cycling through users)
let sessionCounter = 0

// Parse cookies from request
const parseCookies = (request: Request) => {
    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) {
        return {}
    }

    const cookies: Record<string, string> = {}
    cookieHeader.split(';').forEach((cookie) => {
        const [name, value] = cookie.trim().split('=')
        if (name && value) {
            cookies[name] = decodeURIComponent(value)
        }
    })
    return cookies
}

// Session middleware for Bun.serve
const sessionMiddleware = (request: Request, sessionCookieName: string) => {
    const cookies = parseCookies(request)
    const sessionId = cookies[sessionCookieName]

    if (!sessionId || !sessions.has(sessionId)) {
        const newSessionId = crypto.randomUUID()
        const session = {userid: null}
        sessions.set(newSessionId, session)
        return {session, sessionId: newSessionId}
    }

    return {session: sessions.get(sessionId), sessionId}
}

/*
 * Cycle through users when GARAGE44_NO_SECURITY is enabled.
 * First new session gets admin, second gets alice, third gets bob, etc.
 * Resets on server restart (in-memory counter).
 */
const populateNoSecuritySession = async (session: unknown, sessionId: string, userManager: UserManager): Promise<void> => {
    const noSecurityValue = process.env.GARAGE44_NO_SECURITY
    if (!noSecurityValue) return

    // If GARAGE44_NO_SECURITY is set to a specific username (not '1' or 'true'), use that user
    if (noSecurityValue !== '1' && noSecurityValue.toLowerCase() !== 'true') {
        const user = await userManager.getUserByUsername(noSecurityValue)
        if (user) {
            ;(session as {userid?: string}).userid = user.username
            return
        }
    }

    // Cycle through users: admin first, then alice, bob, charlie, etc.
    const users = await userManager.listUsers()

    // Sort users: admin first, then others by creation order
    const sortedUsers = users.toSorted((a, b) => {
        if (a.permissions?.admin && !b.permissions?.admin) return -1
        if (!a.permissions?.admin && b.permissions?.admin) return 1
        return a.createdAt.localeCompare(b.createdAt)
    })

    if (sortedUsers.length === 0) {
        return
    }

    // Get or assign user index for this session
    let userIndex: number
    if (sessionUserIndex.has(sessionId)) {
        userIndex = sessionUserIndex.get(sessionId)!
    } else {
        userIndex = sessionCounter % sortedUsers.length
        sessionUserIndex.set(sessionId, userIndex)
        sessionCounter++
    }

    const assignedUser = sortedUsers[userIndex]
    if (assignedUser) {
        ;(session as {userid?: string}).userid = assignedUser.username
    }
}

// Auth middleware for Bun.serve
const authMiddleware = async (
    request: Request,
    session: unknown,
    sessionId: string,
    userManager: UserManager,
    endpointAllowList: string[] = [],
) => {
    const url = new URL(request.url)

    if (!url.pathname.startsWith('/api')) {
        return true
    }

    /*
     * Check endpoint allow list (public endpoints)
     * Support exact matches and path prefixes (e.g., '/api/docs' matches '/api/docs' and '/api/docs/by-path')
     */
    for (const allowedPath of endpointAllowList) {
        if (url.pathname === allowedPath) {
            return true
        }

        /*
         * Check if pathname starts with allowed path followed by '/' or '?'
         * This allows '/api/docs' to match '/api/docs/by-path' but not '/api/docsomething'
         */
        if (url.pathname.startsWith(allowedPath + '/') || url.pathname.startsWith(allowedPath + '?')) {
            return true
        }
    }

    // Allow authentication endpoints to pass through to handlers
    const authEndpoints = ['/api/context', '/api/login', '/api/logout', '/api/users/me']
    if (authEndpoints.includes(url.pathname)) {
        return true
    }

    // Check if user is authenticated
    if ((session as {userid?: string}).userid) {
        const user = await userManager.getUserByUsername((session as {userid: string}).userid)
        if (user) {
            return true
        }
    }

    if (process.env.GARAGE44_NO_SECURITY) {
        await populateNoSecuritySession(session, sessionId, userManager)
        return true
    }

    return false
}

// Helper to set session cookie in response
const setSessionCookie = (response: Response, sessionId: string, sessionCookieName: string, request?: Request) => {
    const headers = new Headers(response.headers)

    /*
     * Check if request is over HTTPS (for PR deployments and production)
     * Check X-Forwarded-Proto header (set by nginx) or request URL protocol
     */
    let isSecure = false
    if (request) {
        const forwardedProto = request.headers.get('X-Forwarded-Proto')
        const url = new URL(request.url)
        isSecure = forwardedProto === 'https' || url.protocol === 'https:'
    }

    // Add Secure flag when served over HTTPS (required for cookies on HTTPS sites)
    const secureFlag = isSecure ? '; Secure' : ''
    headers.set('Set-Cookie', `${sessionCookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Strict${secureFlag}`)
    return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
    })
}

// WebSocket handler for Bun.serve
const handleWebSocket = (_ws: unknown, _request: Request) => {
    /*
     * Handle WebSocket connections
     * This will be enhanced by the WebSocket server implementation
     */
}

// Create unified middleware with package-specific configuration
export const createMiddleware = (config: MiddlewareConfig, userManager: UserManager) => {
    return {
        handleRequest: async (
            request: Request,
            server?: unknown,
            _logger?: unknown,
            _bunchyConfig?: unknown,
        ): Promise<Response | undefined> => {
            const url = new URL(request.url)

            // Handle custom WebSocket handlers first
            if (config.customWebSocketHandlers) {
                for (const handler of config.customWebSocketHandlers) {
                    if (url.pathname.startsWith(handler.path)) {
                        return await handler.handler(request, server)
                    }
                }
            }

            // Handle WebSocket upgrade requests
            if (url.pathname === '/ws' || url.pathname === '/bunchy') {
                if (server && typeof (server as {upgrade?: unknown}).upgrade === 'function') {
                    // Get session before upgrade so it's available in WebSocket handlers
                    const {session, sessionId} = sessionMiddleware(request, config.sessionCookieName)

                    // Populate session with user if GARAGE44_NO_SECURITY is enabled
                    if (process.env.GARAGE44_NO_SECURITY && !(session as {userid?: string}).userid) {
                        await populateNoSecuritySession(session, sessionId, userManager)
                        sessions.set(sessionId, session)
                    }

                    const success = (server as {upgrade: (req: Request, data: unknown) => boolean}).upgrade(request, {
                        data: {
                            endpoint: url.pathname,
                            session,
                        },
                    })
                    if (success) {
                        return
                    }
                    return new Response('WebSocket upgrade failed', {status: 400})
                }
                return new Response('WebSocket server not available', {status: 500})
            }

            // Handle session and auth
            const {session, sessionId} = sessionMiddleware(request, config.sessionCookieName)

            if (!(await authMiddleware(request, session, sessionId, userManager, config.endpointAllowList))) {
                return new Response('Unauthorized', {status: 401})
            }

            // Return null to indicate no handler matched - let the package handle routing
            return null
        },
        handleWebSocket,
        sessionMiddleware: (request: Request) => sessionMiddleware(request, config.sessionCookieName),
        setSessionCookie: (response: Response, sessionId: string, request?: Request) =>
            setSessionCookie(response, sessionId, config.sessionCookieName, request),
        userManager,
    }
}

// Create unified final request handler with common patterns
export const createFinalHandler = (config: {
    configPath: string
    contextFunctions: {
        adminContext: () => unknown
        deniedContext: () => unknown
        userContext: () => unknown
    }
    customWebSocketHandlers?: Array<{
        handler: (request: Request, server: unknown) => Promise<Response | undefined>
        path: string
    }>
    devContext: {
        addHttp: (data: unknown) => void
    }
    endpointAllowList: string[]
    logger: {
        debug: (msg: string) => void
        info: (msg: string) => void
    }
    mimeTypes?: Record<string, string>
    packageName: string
    publicPath: string
    router: {
        route: (request: Request, session: unknown) => Promise<Response | null>
    }
    sessionCookieName: string
    userManager: UserManager
}) => {
    const unifiedMiddleware = createMiddleware(
        {
            configPath: config.configPath,
            customWebSocketHandlers: config.customWebSocketHandlers,
            endpointAllowList: config.endpointAllowList,
            packageName: config.packageName,
            sessionCookieName: config.sessionCookieName,
        },
        config.userManager,
    )

    return async (request: Request, server?: unknown): Promise<Response | undefined> => {
        const url = new URL(request.url)

        config.devContext.addHttp({method: request.method, ts: Date.now(), url: url.pathname})

        // Get session early
        let {session, sessionId} = unifiedMiddleware.sessionMiddleware(request)

        /*
         * Handle ?debug_user=<username> override (only when GARAGE44_NO_SECURITY is set)
         * This sets the session user and redirects without the query param.
         * The session cookie persists the user across requests - no extra cookies needed.
         */
        if (process.env.GARAGE44_NO_SECURITY) {
            const debugUser = url.searchParams.get('debug_user')
            if (debugUser) {
                const user = await config.userManager.getUserByUsername(debugUser)
                if (user) {
                    ;(session as {userid?: string}).userid = user.username
                    sessions.set(sessionId, session)
                    config.logger.debug(`[Middleware] debug_user override: session ${sessionId} -> ${user.username}`)
                }

                // Redirect to same URL without the debug_user param
                const cleanUrl = new URL(request.url)
                cleanUrl.searchParams.delete('debug_user')
                const response = new Response(null, {status: 302})
                response.headers.set('Location', cleanUrl.pathname + cleanUrl.search)
                return unifiedMiddleware.setSessionCookie(response, sessionId, request)
            }

            // If session has no user yet, cycle through users
            if (!(session as {userid?: string}).userid) {
                await populateNoSecuritySession(session, sessionId, config.userManager)
                sessions.set(sessionId, session)
                const userId = (session as {userid?: string}).userid
                if (userId) {
                    config.logger.debug(`[Middleware] Cycled session ${sessionId} -> ${userId}`)
                }
            }
        }

        /*
         * Use unified middleware for session/auth and custom handlers
         * Pass the populated session to unified middleware by ensuring it uses the same session
         */
        const unifiedResponse = await unifiedMiddleware.handleRequest(request, server, config.logger, null)
        if (unifiedResponse) {
            return unifiedResponse
        }

        /*
         * Reuse the same session from the first call instead of creating a new one
         * This ensures we don't create multiple sessions for the same request
         * The session object is passed by reference, so modifications persist
         */
        const finalSession = session
        const finalSessionId = sessionId

        // Handle /api/context - requires authentication to check session state
        if (url.pathname === '/api/context') {
            let context = null

            if (process.env.GARAGE44_NO_SECURITY) {
                // Use the user from the session (already set by cycling or debug_user)
                const sessionUserId = (finalSession as {userid?: string})?.userid
                let targetUser = sessionUserId ? await config.userManager.getUserByUsername(sessionUserId) : null

                // Fallback to first admin user if session has no user
                if (!targetUser) {
                    const users = await config.userManager.listUsers()
                    targetUser = users.find((user) => user.permissions?.admin)
                }

                // Use adminContext for all no-security users (full access in dev mode)
                const baseContext = await Promise.resolve(config.contextFunctions.adminContext())

                if (targetUser) {
                    context = {
                        ...(baseContext as Record<string, unknown>),
                        id: targetUser.id,
                        password: targetUser.password.key,
                        profile: {
                            avatar: targetUser.profile.avatar || 'placeholder-1.png',
                            displayName: targetUser.profile.displayName || targetUser.username,
                        },
                        username: targetUser.username,
                    } as typeof context
                } else {
                    context = baseContext
                }
                const noSecurityResponse = new Response(JSON.stringify(context), {
                    headers: {'Content-Type': 'application/json'},
                })
                return unifiedMiddleware.setSessionCookie(noSecurityResponse, finalSessionId, request)
            }

            // Check session for user context
            if ((finalSession as {userid?: string})?.userid) {
                const user = await config.userManager.getUserByUsername((finalSession as {userid: string}).userid)
                if (user) {
                    const baseContext = user.permissions?.admin
                        ? await Promise.resolve(config.contextFunctions.adminContext())
                        : await Promise.resolve(config.contextFunctions.userContext())

                    /*
                     * Include full user profile in context
                     * Include password for SFU auth (will encrypt later)
                     */
                    context = {
                        ...(baseContext as Record<string, unknown>),
                        id: user.id,
                        password: user.password.key,
                        profile: {
                            avatar: user.profile.avatar || 'placeholder-1.png',
                            displayName: user.profile.displayName || user.username,
                        },
                        username: user.username,
                    } as typeof context
                } else {
                    context = config.contextFunctions.deniedContext()
                }
            } else {
                context = config.contextFunctions.deniedContext()
            }

            const contextResponse = new Response(JSON.stringify(context), {
                headers: {'Content-Type': 'application/json'},
            })
            return unifiedMiddleware.setSessionCookie(contextResponse, finalSessionId, request)
        }

        // Handle /api/users/me - get current user profile
        if (url.pathname === '/api/users/me' && request.method === 'GET') {
            const username = (finalSession as {userid?: string}).userid

            if (!username) {
                return new Response(JSON.stringify({error: 'not authenticated'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 401,
                })
            }

            const user = await config.userManager.getUserByUsername(username)
            if (!user) {
                return new Response(JSON.stringify({error: 'user not found'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 404,
                })
            }

            // Return user data in the format expected by the frontend
            const userMeResponse = new Response(
                JSON.stringify({
                    id: user.id,
                    profile: {
                        avatar: user.profile.avatar || 'placeholder-1.png',
                        displayName: user.profile.displayName || user.username,
                    },
                    username: user.username,
                }),
                {
                    headers: {'Content-Type': 'application/json'},
                },
            )
            return unifiedMiddleware.setSessionCookie(userMeResponse, finalSessionId, request)
        }

        if (url.pathname === '/api/login' && request.method === 'POST') {
            const body = await request.json()
            const username = body.username
            const password = body.password

            let context = await Promise.resolve(config.contextFunctions.deniedContext())
            const user = await config.userManager.authenticate(username, password)

            if (user) {
                /*
                 * Use finalSession and finalSessionId to ensure we're modifying the session that will be used
                 * Set the user in session
                 */
                ;(finalSession as {userid: string}).userid = user.username

                /*
                 * Explicitly save the session to ensure it persists
                 * Since JavaScript objects are passed by reference, modifying finalSession updates the Map entry
                 * But we explicitly set it again to ensure it's stored with the correct sessionId
                 */
                sessions.set(finalSessionId, finalSession)

                const baseContext = user.permissions?.admin
                    ? await Promise.resolve(config.contextFunctions.adminContext())
                    : await Promise.resolve(config.contextFunctions.userContext())

                /*
                 * Include full user profile in context
                 * Include password for SFU auth (will encrypt later)
                 */
                context = {
                    ...(baseContext as Record<string, unknown>),
                    id: user.id,
                    password: user.password.key,
                    profile: {
                        avatar: user.profile.avatar || 'placeholder-1.png',
                        displayName: user.profile.displayName || user.username,
                    },
                    username: user.username,
                } as typeof context
            } else {
                console.log(`[AUTH] Authentication failed for user: ${username}`)
            }

            const loginResponse = new Response(JSON.stringify(context), {
                headers: {'Content-Type': 'application/json'},
            })

            /*
             * Set session cookie after login (with Secure flag for HTTPS)
             * Use finalSessionId to ensure consistency with the session we just modified
             */
            return unifiedMiddleware.setSessionCookie(loginResponse, finalSessionId, request)
        }

        if (url.pathname === '/api/logout' && request.method === 'GET') {
            // Clear the session - use finalSession to ensure we're modifying the correct session
            if (finalSession) {
                ;(finalSession as {userid: string | null}).userid = null
                sessions.set(finalSessionId, finalSession)
            }

            const context = config.contextFunctions.deniedContext()
            const logoutResponse = new Response(JSON.stringify(context), {
                headers: {'Content-Type': 'application/json'},
            })
            // Set session cookie after logout (with Secure flag for HTTPS)
            return unifiedMiddleware.setSessionCookie(logoutResponse, finalSessionId, request)
        }

        // Serve static files from public directory
        if (url.pathname.startsWith('/public/')) {
            const filePath = path.join(config.publicPath, url.pathname.replace('/public', ''))
            try {
                const file = Bun.file(filePath)
                if (await file.exists()) {
                    config.logger.debug(`[HTTP] GET ${filePath}`)
                    config.devContext.addHttp({method: 'GET', status: 200, ts: Date.now(), url: filePath})

                    // Use custom MIME types if provided (Pyrite), otherwise default
                    if (config.mimeTypes) {
                        const ext = path.extname(filePath).toLowerCase()
                        const contentType = config.mimeTypes[ext] || 'application/octet-stream'
                        return new Response(file, {
                            headers: {'Content-Type': contentType},
                        })
                    }

                    return new Response(file)
                }
            } catch (error) {
                // File doesn't exist, continue to next handler
                config.logger.debug(`[HTTP] static file not found: ${filePath} (${error})`)
            }
        }

        // Try the router for HTTP API endpoints
        const apiResponse = await config.router.route(request, finalSession as Record<string, string>)
        if (apiResponse) {
            config.logger.info(`[HTTP] API route matched ${url.pathname}`)
            config.devContext.addHttp({method: request.method, status: apiResponse.status, ts: Date.now(), url: url.pathname})
            // Set session cookie if this is a new session
            return unifiedMiddleware.setSessionCookie(apiResponse, finalSessionId, request)
        }

        // SPA fallback - serve index.html for all other routes
        try {
            const indexFile = Bun.file(path.join(config.publicPath, 'index.html'))
            if (await indexFile.exists()) {
                const response = new Response(indexFile, {
                    headers: {'Content-Type': 'text/html'},
                })
                config.devContext.addHttp({method: request.method, status: 200, ts: Date.now(), url: url.pathname})
                return unifiedMiddleware.setSessionCookie(response, sessionId, request)
            }
        } catch (error) {
            // index.html doesn't exist
            config.logger.debug(`[HTTP] SPA fallback index.html not found: ${error}`)
        }

        // Final fallback - 404
        config.logger.info(`[HTTP] 404 for ${url.pathname}`)
        const response = new Response('Not Found', {status: 404})
        config.devContext.addHttp({method: request.method, status: 404, ts: Date.now(), url: url.pathname})
        return unifiedMiddleware.setSessionCookie(response, finalSessionId, request)
    }
}

export {handleWebSocket}
