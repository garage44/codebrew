import {WebSocketClient} from '@garage44/common/lib/ws-client'
import {logger} from '@garage44/common/lib/logger'

// Keep track of which stylesheets are currently being updated
const pendingStylesheetUpdates = new Set<string>()

// Exception page state
let exceptionOverlay: HTMLElement | null = null

function updateStylesheet(filename: string, publicPath: string): void {
    // Skip if this stylesheet is already being updated
    if (pendingStylesheetUpdates.has(filename)) {
        return
    }

    // Mark this stylesheet as being updated
    pendingStylesheetUpdates.add(filename)

    // Get all stylesheet links
    const allLinks = [...document.querySelectorAll('link[rel=stylesheet]')]
        .map((link: Element): HTMLLinkElement => link as HTMLLinkElement)

    // Find matching stylesheet by base name (without hash)
    // Extract 'app' from 'app.axuasllor.css'
    const baseFileName = filename.split('.')[0]
    const linkElements = allLinks.filter((link: HTMLLinkElement): boolean => {
        const {href} = link
        // Match /public/app.*.css or /public/components.*.css pattern
        const pattern = new RegExp(`/public/${baseFileName}\\.[^/]*\\.css`)
        return pattern.test(href)
    })

    if (linkElements.length === 0) {
        pendingStylesheetUpdates.delete(filename)
        return
    }

    // Create new stylesheet link - use public path since static files are served from /public/
    const newLink = document.createElement('link')
    newLink.rel = 'stylesheet'
    newLink.href = `/public/${filename}?${Date.now()}`

        // When the new stylesheet loads, remove all old ones
    newLink.onload = (): void => {
        // Remove all matching old stylesheets
        for (const oldLink of linkElements) {
            oldLink.remove()
        }
        pendingStylesheetUpdates.delete(filename)
    }

    // Handle loading errors
    newLink.onerror = (): void => {
        // eslint-disable-next-line no-console
        console.error(`Failed to load stylesheet: ${newLink.href}`)
        pendingStylesheetUpdates.delete(filename)
    }

    // Insert the new stylesheet after the first matching one
    if (linkElements.length > 0) {
        const firstLink = linkElements[0]
        firstLink.parentNode?.insertBefore(newLink, firstLink.nextSibling)
    } else {
        // Fallback: append to head if no existing stylesheets found
        document.head.append(newLink)
    }
}

function showExceptionPage(task: string, error: string, details: string, timestamp: string): void {
    // Remove existing exception overlay if it exists
    if (exceptionOverlay) {
        exceptionOverlay.remove()
    }

    // Create exception overlay
    exceptionOverlay = document.createElement('div')
    exceptionOverlay.id = 'bunchy-exception-overlay'
    exceptionOverlay.innerHTML = `
        <div class="bunchy-exception-container">
            <div class="bunchy-exception-header">
                <h1>🚨 Build Error</h1>
                <button class="bunchy-exception-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="bunchy-exception-content">
                <div class="bunchy-exception-task">
                    <strong>Task:</strong> ${task}
                </div>
                <div class="bunchy-exception-error">
                    <strong>Error:</strong> ${error}
                </div>
                <div class="bunchy-exception-details">
                    <strong>Details:</strong>
                    <pre>${details}</pre>
                </div>
                <div class="bunchy-exception-timestamp">
                    <strong>Time:</strong> ${new Date(timestamp).toLocaleString()}
                </div>
            </div>
        </div>
    `

    // Add styles
    const styles = document.createElement('style')
    styles.textContent = `
        #bunchy-exception-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Courier New', monospace;
        }

        .bunchy-exception-container {
            background: #1a1a1a;
            color: #fff;
            border-radius: 8px;
            max-width: 800px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            border: 2px solid #dc2626;
        }

        .bunchy-exception-header {
            background: #dc2626;
            color: white;
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 6px 6px 0 0;
        }

        .bunchy-exception-header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: bold;
        }

        .bunchy-exception-close {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .bunchy-exception-close:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .bunchy-exception-content {
            padding: 20px;
        }

        .bunchy-exception-task,
        .bunchy-exception-error,
        .bunchy-exception-details,
        .bunchy-exception-timestamp {
            margin-bottom: 16px;
        }

        .bunchy-exception-task strong,
        .bunchy-exception-error strong,
        .bunchy-exception-details strong,
        .bunchy-exception-timestamp strong {
            color: #fbbf24;
            display: block;
            margin-bottom: 4px;
        }

        .bunchy-exception-details pre {
            background: #2d2d2d;
            border: 1px solid #404040;
            border-radius: 4px;
            padding: 12px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 12px;
            line-height: 1.4;
            color: #f87171;
        }

        .bunchy-exception-timestamp {
            font-size: 14px;
            color: #9ca3af;
            border-top: 1px solid #404040;
            padding-top: 12px;
        }
    `

    // Add styles to head if not already present
    if (!document.querySelector('#bunchy-exception-styles')) {
        styles.id = 'bunchy-exception-styles'
        document.head.append(styles)
    }

    // Add overlay to body
    document.body.append(exceptionOverlay)

    // Add escape key handler
    const escapeHandler = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && exceptionOverlay) {
            exceptionOverlay.remove()
            document.removeEventListener('keydown', escapeHandler)
        }
    }
    document.addEventListener('keydown', escapeHandler)
}

function hideExceptionPage(): void {
    if (exceptionOverlay) {
        exceptionOverlay.remove()
        exceptionOverlay = null
    }
}

async function handleHMRUpdate(_filePath: string, timestamp: number): Promise<void> {
    const globalObj = globalThis as unknown as {
        __HMR_STATE__?: unknown
        __HMR_COMPONENT_STATES__?: Record<string, unknown>
        __HMR_REGISTRY__?: Record<string, unknown>
        __HMR_UPDATING__?: boolean
        __HMR_MAIN_COMPONENT__?: unknown
    }
    try {
        hideExceptionPage()

        // Initialize HMR state storage if not exists
        if (!globalObj.__HMR_STATE__) {globalObj.__HMR_STATE__ = null}
        if (!globalObj.__HMR_COMPONENT_STATES__) {globalObj.__HMR_COMPONENT_STATES__ = {}}
        if (!globalObj.__HMR_REGISTRY__) {globalObj.__HMR_REGISTRY__ = {}}

        // Save global store state
        try {
            const {store} = await import('@garage44/common/app')
            if (store?.state) {
                globalObj.__HMR_STATE__ = JSON.parse(JSON.stringify(store.state))
            }
        } catch(error) {
            // eslint-disable-next-line no-console
            console.warn('[Bunchy HMR] Could not access store state:', error)
        }

        // Save component-level states from registry
        const registry = globalObj.__HMR_REGISTRY__ || {}
        const componentStates: Record<string, unknown> = {}
        for (const [key, state] of Object.entries(registry)) {
            try {
                componentStates[key] = JSON.parse(JSON.stringify(state))
            } catch {
                // eslint-disable-next-line no-console
                console.warn(`[Bunchy HMR] Could not serialize state for ${key}`)
            }
        }
        globalObj.__HMR_COMPONENT_STATES__ = componentStates

        // Find and reload the app script
        const scriptTags = [...document.querySelectorAll('script[type="module"]')] as HTMLScriptElement[]
        const appScript = scriptTags.find((script: HTMLScriptElement): boolean => {
            const src = script.src.split('?')[0]
            return src.includes('/public/app.') && /\/public\/app\.[^/]+\.js$/.test(src)
        })

        if (!appScript) {
            // eslint-disable-next-line no-console
            console.error('[Bunchy HMR] Could not find app script tag')
            globalThis.location.reload()
            return
        }

        const originalSrc = appScript.src.split('?')[0]
        appScript.remove()

        /*
         * Set HMR update flag BEFORE creating/loading the script
         * This is critical - ES modules execute immediately when appended
         */
        globalObj.__HMR_UPDATING__ = true

        // Set data attribute on html and body BEFORE script loads to disable CSS animations
        document.documentElement.dataset.hmrUpdating = 'true'
        document.body.dataset.hmrUpdating = 'true'
        // Force reflow
        // eslint-disable-next-line no-void
        void document.body.offsetHeight

        // Create new script with cache busting
        const newScript = document.createElement('script')
        newScript.type = 'module'
        newScript.src = `${originalSrc}?t=${timestamp}`

        // Wait for script to load
        newScript.onload = async(): Promise<void> => {
            /*
             * The new script will execute and call app.init() with HMR flag set
             * app.init() will detect HMR and re-initialize services, then re-render
             * Wait a brief moment for the module to execute
             */
            await new Promise<void>((resolve): void => {
                setTimeout((): void => {
                    resolve()
                }, 10)
            })

            // Verify the Main component was updated
            if (!globalObj.__HMR_MAIN_COMPONENT__) {
                // eslint-disable-next-line no-console
                console.error('[Bunchy HMR] Main component not found after script load')
                globalThis.location.reload()
            }
        }

        newScript.onerror = (): void => {
            // eslint-disable-next-line no-console
            console.error('[Bunchy HMR] Failed to load new script')
            globalThis.location.reload()
        }

        // Insert new script - this will cause it to execute immediately
        document.head.append(newScript)
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error('[Bunchy HMR] Failed:', error)
        globalThis.location.reload()
    }
}

/*
 * Helper function to initialize Bunchy
 * Only initialize once to prevent multiple connections
 */
function initializeBunchy(): BunchyClient | undefined {
    const globalObj = globalThis as unknown as {__BUNCHY_INITIALIZED__?: boolean}
    if (globalObj.__BUNCHY_INITIALIZED__) {
        return
    }
    globalObj.__BUNCHY_INITIALIZED__ = true
    return new BunchyClient()
}

function setupLoggerForwarding(client: WebSocketClient): void {
    // Set up log forwarding for the browser logger
    const loggerWithForwarder = logger as unknown as {setLogForwarder?: (forwarder: (logLevel: string, msg: string, args: unknown[]) => void) => void}
    if (typeof loggerWithForwarder.setLogForwarder === 'function') {
        // eslint-disable-next-line no-console
        console.log('[Bunchy] Setting up log forwarder')
        let isForwarding = false
        loggerWithForwarder.setLogForwarder((logLevel: string, msg: string, args: unknown[]): void => {
            // Prevent recursive forwarding caused by logs emitted during forwarding (e.g., ws-client debug)
            if (isForwarding) {
                return
            }
            // Only forward if we're connected
            const clientWithConnection = client as unknown as {isConnected?: () => boolean}
            if (clientWithConnection.isConnected && clientWithConnection.isConnected()) {
                const serializedArgs = args.map((arg: unknown): string => {
                    try {
                        return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                    } catch {
                        return '[Circular or unserializable object]'
                    }
                })

                isForwarding = true
                client
                    .post('/logs/forward', {
                        args: serializedArgs,
                        level: logLevel,
                        message: msg,
                        source: 'client',
                        timestamp: new Date().toISOString(),
                    })
                    .catch((error: unknown): void => {
                        // eslint-disable-next-line no-console
                        console.warn('[Bunchy] Failed to forward log:', error)
                    })
                    .finally((): void => {
                        isForwarding = false
                    })
            }
        })
    } else {
        // eslint-disable-next-line no-console
        console.warn('[Bunchy] logger.setLogForwarder is not available')
    }
}

// Helper function to construct WebSocket URL based on current protocol
function getWebSocketUrl(path: string): string {
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const {hostname} = globalThis.location
    const {port} = (globalThis.location as {port?: string})

    /*
     * Only include port if it's explicitly set and not the default (80 for HTTP, 443 for HTTPS)
     * When behind Nginx with SSL, the port will be empty (defaults to 443) and Nginx will proxy to backend
     */
    const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : ''
    return `${protocol}//${hostname}${portSuffix}${path}`
}

class BunchyClient extends WebSocketClient {
    constructor() {
        /*
         * Use the full path to prevent WebSocketClient from appending /ws
         * The endpoint should match the path provided in the server configuration
         * Detect HTTP/HTTPS and use ws:// or wss:// accordingly
         */
        const url = getWebSocketUrl('/bunchy')

        super(url)

        // eslint-disable-next-line no-console
        console.log('[Bunchy] Client initialized')

        // Set up route handlers BEFORE connecting to avoid race condition
        this.setupRouter()
        // Use generic helper to attach forwarding
        setupLoggerForwarding(this)

        // Hook into the open event to override message handling
        this.on('open', (): void => {
            // WebSocket opened, handlers registered
        })

        // Small delay to ensure handlers are fully registered before connecting
        setTimeout((): void => {
            this.connect()
        }, 100)
    }

    setupRouter(): void {
        // Using URL-based routing method for handling bunchy task messages
        this.onRoute('/tasks/code_frontend', (): void => {
            hideExceptionPage()
            globalThis.location.reload()
        })

        this.onRoute('/tasks/html', (): void => {
            hideExceptionPage()
            globalThis.location.reload()
        })

        this.onRoute('/tasks/styles/app', (data: unknown): void => {
            const {filename, publicPath} = data as {filename: string; publicPath: string}
            hideExceptionPage()
            updateStylesheet(filename, publicPath)
        })

        this.onRoute('/tasks/styles/components', (data: unknown): void => {
            const {filename, publicPath} = data as {filename: string; publicPath: string}
            hideExceptionPage()
            updateStylesheet(filename, publicPath)
        })

        this.onRoute('/tasks/error', (data: unknown): void => {
            const {details, error, task, timestamp} = data as {details: string; error: string; task: string; timestamp: string}
            showExceptionPage(task, error, details, timestamp)
        })

        this.onRoute('/tasks/hmr', (data: unknown): void => {
            const {filePath, timestamp} = data as {filePath: string; timestamp: number}
            handleHMRUpdate(filePath, timestamp)
        })
    }

    // Backwards compatible method (delegates to generic function)
    setupLogForwarding(): void {
        setupLoggerForwarding(this)
    }
}

/*
 * Auto-initialize when script loads (after BunchyClient is defined)
 * Since this script is only included in development mode (see index.html template),
 * we can always initialize it
 */
initializeBunchy()

export {initializeBunchy, setupLoggerForwarding, BunchyClient}
