/**
 * WebSocket Server Tests
 * Tests error handling, robustness, and protocol behavior
 * These tests serve as executable documentation of the WebSocket protocol
 */

import {describe, expect, test, afterEach} from 'bun:test'

import type {MessageData, WebSocketMessage} from '../lib/ws-client.ts'

import {TestClient} from './helpers/test-client.ts'
import {TestServer} from './helpers/test-server.ts'

describe('WebSocket Server - Error Handling', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should send error response when message has invalid JSON', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Send invalid JSON
        const ws = (client.client as unknown as {ws?: WebSocket}).ws
        if (ws) {
            ws.send('invalid json{')
        }

        const errorMessage = await client.waitForMessage(2000)
        expect(errorMessage).toBeDefined()
        expect((errorMessage as WebSocketMessage).url).toBe('/error')
        expect((errorMessage as WebSocketMessage).data).toBeDefined()
        expect((errorMessage as WebSocketMessage).data?.error).toContain('Invalid JSON')

        client.disconnect()
    })

    test('should send error response when message is missing url field', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Send message without url
        await client.client.send('/test', {test: 'data'})
        // Override to send invalid message
        const ws = (client.client as unknown as {ws?: WebSocket}).ws
        if (ws) {
            ws.send(JSON.stringify({data: {test: 'data'}, id: '123'}))
        }

        const errorMessage = await client.waitForMessage(2000)
        expect(errorMessage).toBeDefined()
        expect((errorMessage as WebSocketMessage).url).toBe('/error')
        expect((errorMessage as WebSocketMessage).data).toBeDefined()
        expect((errorMessage as WebSocketMessage).data?.error).toContain('Missing required field: url')

        client.disconnect()
    })

    test('should send error response when no route matches', async () => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Send request to non-existent route
        const response = await client.client.post('/api/nonexistent', {test: 'data'})

        expect(response).toBeDefined()
        expect((response as MessageData)?.error).toContain('No route matched')

        client.disconnect()
    })

    test('should send error response when handler throws error', async () => {
        server = new TestServer()
        await server.start()

        // Register a handler that throws
        server.wsManager.api.get('/api/error', async () => {
            throw new Error('Handler error')
        })

        const client = new TestClient(server.getUrl())
        await client.connect()

        const response = await client.client.get('/api/error')

        expect(response).toBeDefined()
        expect((response as MessageData)?.error).toBe('Handler error')

        client.disconnect()
    })
})

describe('WebSocket Server - Broadcast Robustness', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should not crash when broadcasting to dead connections', async () => {
        server = new TestServer()
        await server.start()

        const client1 = new TestClient(server.getUrl())
        await client1.connect()

        // Close connection to make it dead
        client1.disconnect()

        // Wait a bit for connection to close
        await new Promise((resolve) => {
            setTimeout(resolve, 100)
        })

        // Broadcast should not crash
        expect(() => {
            server.wsManager.broadcast('/test', {message: 'test'})
        }).not.toThrow()

        // Dead connection should be cleaned up
        expect(server.wsManager.connections.size).toBe(0)
    })

    test('should clean up dead connections during broadcast', async () => {
        server = new TestServer()
        await server.start()

        const client1 = new TestClient(server.getUrl())
        await client1.connect()

        const client2 = new TestClient(server.getUrl())
        await client2.connect()

        // Close one connection
        client1.disconnect()
        await new Promise((resolve) => {
            setTimeout(resolve, 100)
        })

        // Broadcast should clean up dead connection
        server.wsManager.broadcast('/test', {message: 'test'})

        // Only live connection should remain
        expect(server.wsManager.connections.size).toBe(1)

        client2.disconnect()
    })
})

describe('WebSocket Server - Request/Response', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should handle GET request and return response', async () => {
        server = new TestServer()
        await server.start()

        server.wsManager.api.get('/api/test', async () => {
            return {data: 'test', success: true}
        })

        const client = new TestClient(server.getUrl())
        await client.connect()

        const response = await client.client.get('/api/test')

        expect(response).toBeDefined()
        expect((response as MessageData)?.success).toBe(true)
        expect((response as MessageData)?.data).toBe('test')

        client.disconnect()
    })

    test('should handle POST request with data', async () => {
        server = new TestServer()
        await server.start()

        server.wsManager.api.post('/api/test', async (_ctx, req) => {
            return {received: req.data, success: true}
        })

        const client = new TestClient(server.getUrl())
        await client.connect()

        const response = await client.client.post('/api/test', {test: 'data'})

        expect(response).toBeDefined()
        expect((response as MessageData)?.success).toBe(true)
        expect((response as MessageData)?.received).toEqual({test: 'data'})

        client.disconnect()
    })
})
