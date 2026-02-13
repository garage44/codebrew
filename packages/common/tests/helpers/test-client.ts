/**
 * Test Client Helper
 * Creates a test WebSocket client for testing WebSocket protocol
 */

import {WebSocketClient} from '../../lib/ws-client.ts'

export class TestClient {
    public client: WebSocketClient

    public messages: Array<unknown> = []

    public errors: Array<Error> = []

    constructor(url: string) {
        this.client = new WebSocketClient(url)

        // Collect all messages
        this.client.on('message', (message) => {
            this.messages.push(message)
        })

        // Collect all errors
        this.client.on('error', (error) => {
            this.errors.push(error instanceof Error ? error : new Error(String(error)))
        })
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'))
            }, 5000)

            this.client.once('open', () => {
                clearTimeout(timeout)
                resolve()
            })

            this.client.once('error', (error) => {
                clearTimeout(timeout)
                reject(error)
            })

            this.client.connect()
        })
    }

    disconnect(): void {
        this.client.close()
    }

    waitForMessage(timeout = 5000): Promise<unknown> {
        return new Promise((resolve, reject) => {
            if (this.messages.length > 0) {
                resolve(this.messages.at(-1))
                return
            }

            const timer = setTimeout(() => {
                reject(new Error('Message timeout'))
            }, timeout)

            this.client.once('message', (message) => {
                clearTimeout(timer)
                resolve(message)
            })
        })
    }

    clearMessages(): void {
        this.messages = []
        this.errors = []
    }
}
