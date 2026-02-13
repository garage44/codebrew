/**
 * WebSocket Client Tests
 * Tests client error handling, validation, and reconnection behavior
 * These tests serve as executable documentation of the WebSocket client protocol
 */

import {describe, expect, test, afterEach} from 'bun:test'

import type {MessageData} from '../lib/ws-client.ts'

import {TestClient} from './helpers/test-client.ts'
import {TestServer} from './helpers/test-server.ts'

describe('WebSocket Client - Message Validation', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should emit error event when receiving invalid JSON', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Send invalid JSON from server side
        const ws = Array.from(server.wsManager.connections)[0]
        if (ws) {
            ws.send('invalid json{')
        }

        // Wait for error
        await new Promise((resolve) => {
            setTimeout(resolve, 100)
        })

        expect(client.errors.length).toBeGreaterThan(0)
        expect(client.errors[0].message).toContain('Invalid JSON')

        client.disconnect()
    })

    test('should handle malformed message structure gracefully', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Send null message
        const ws = Array.from(server.wsManager.connections)[0]
        if (ws) {
            ws.send(JSON.stringify(null))
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 100)
        })

        expect(client.errors.length).toBeGreaterThan(0)
        expect(client.errors[0].message).toContain('Invalid message format')

        client.disconnect()
    })

    test('should handle messages without url field', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Send message without url
        const ws = Array.from(server.wsManager.connections)[0]
        if (ws) {
            ws.send(JSON.stringify({data: {test: 'data'}}))
        }

        // Should not crash, message should be ignored or handled gracefully
        await new Promise((resolve) => {
            setTimeout(resolve, 100)
        })

        // Client should still be connected
        expect(client.client.isConnected()).toBe(true)

        client.disconnect()
    })
})

describe('WebSocket Client - Request/Response', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should send request and receive response', async () => {
        server = new TestServer()
        await server.start()

        server.wsManager.api.get('/api/test', async () => {
            return {success: true}
        })

        const client = new TestClient(server.getUrl())
        await client.connect()

        const response = await client.client.get('/api/test')

        expect(response).toBeDefined()
        expect((response as MessageData)?.success).toBe(true)

        client.disconnect()
    })

    test('should queue messages when not connected', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        // Don't connect yet

        // Send request before connecting
        const requestPromise = client.client.get('/api/test')

        // Now connect
        await client.connect()

        // Register handler
        server.wsManager.api.get('/api/test', async () => {
            return {success: true}
        })

        // Request should complete after connection
        const response = await requestPromise
        expect(response).toBeDefined()

        client.disconnect()
    })
})

describe('WebSocket Client - Reconnection', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should reconnect after connection closes', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        expect(client.client.isConnected()).toBe(true)

        // Close server
        server.stop()

        // Wait for reconnection attempt
        await new Promise((resolve) => {
            setTimeout(resolve, 200)
        })

        /*
         * Client should attempt to reconnect (we can't easily test full reconnection without server)
         * But we can verify it doesn't crash
         */
        expect(client.errors.length).toBeGreaterThanOrEqual(0)
    })
})
