/**
 * Test Server Helper
 * Creates a test WebSocket server for testing WebSocket protocol
 */

import {createBunWebSocketHandler, WebSocketServerManager} from '../../lib/ws-server.ts'

export interface TestServerOptions {
    port?: number
    endpoint?: string
    authOptions?: {
        noSecurityEnv?: string
        users?: Array<{name: string}>
    }
}

export class TestServer {
    private server: ReturnType<typeof Bun.serve> | null = null
    public wsManager: WebSocketServerManager
    public port: number
    public endpoint: string

    constructor(options: TestServerOptions = {}) {
        this.port = options.port || 0 // 0 = random port
        this.endpoint = options.endpoint || '/ws'

        this.wsManager = new WebSocketServerManager({
            endpoint: this.endpoint,
            authOptions: options.authOptions,
        })
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const wsManagers = new Map([[this.endpoint, this.wsManager]])
                const wsHandler = createBunWebSocketHandler(wsManagers)

                // Use a random port if port is 0
                const port = this.port || 0

                this.server = Bun.serve({
                    port,
                    fetch: (req, server) => {
                        // Handle WebSocket upgrade
                        if (server.upgrade(req, {data: {endpoint: this.endpoint}})) {
                            return
                        }
                        return new Response('Not Found', {status: 404})
                    },
                    websocket: wsHandler,
                })

                // Update port in case it was 0 (random port)
                this.port = this.server.port

                resolve()
            } catch (error) {
                reject(error)
            }
        })
    }

    stop(): void {
        if (this.server) {
            this.server.stop()
            this.server = null
        }
    }

    getUrl(): string {
        return `ws://localhost:${this.port}${this.endpoint}`
    }
}
