/**
 * Test Server Helper
 * Creates a test WebSocket server for testing WebSocket protocol
 */

import {WebSocketServerManager, createBunWebSocketHandler} from '../../lib/ws-server.ts'

export interface TestServerOptions {
    authOptions?: {
        noSecurityEnv?: string
        users?: {name: string}[]
    }
    endpoint?: string
    port?: number
}

export class TestServer {
    private server: ReturnType<typeof Bun.serve> | null = null

    public wsManager: WebSocketServerManager

    public port: number

    public endpoint: string

    constructor(options: TestServerOptions = {}) {
        // 0 = random port
        this.port = options.port || 0
        this.endpoint = options.endpoint || '/ws'

        this.wsManager = new WebSocketServerManager({
            authOptions: options.authOptions,
            endpoint: this.endpoint,
        })
    }

    start(): Promise<void> {
        return new Promise<void>((resolve, reject): void => {
            try {
                const wsManagers = new Map([[this.endpoint, this.wsManager]])
                const wsHandler = createBunWebSocketHandler(wsManagers)

                // Use a random port if port is 0
                const port = this.port || 0

                this.server = Bun.serve({
                    fetch: (
                        req: Request,
                        server: {upgrade: (req: Request, opts: {data: {endpoint: string}}) => boolean},
                    ): Response | undefined => {
                        // Handle WebSocket upgrade
                        if (server.upgrade(req, {data: {endpoint: this.endpoint}})) {
                            return
                        }
                        return new Response('Not Found', {status: 404})
                    },
                    port,
                    websocket: wsHandler,
                })

                // Update port in case it was 0 (random port)
                this.port = this.server.port || this.port

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
