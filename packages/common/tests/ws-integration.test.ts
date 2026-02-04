/**
 * WebSocket Integration Tests
 * Tests end-to-end protocol behavior, multiple connections, and real-world scenarios
 * These tests serve as executable documentation of complete WebSocket workflows
 */

import {describe, expect, test, afterEach} from 'bun:test'
import {TestServer} from './helpers/test-server.ts'
import {TestClient} from './helpers/test-client.ts'

describe('WebSocket Integration - Full Request/Response Cycle', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should complete full request/response cycle', async() => {
        server = new TestServer()
        await server.start()

        server.wsManager.api.post('/api/users', async(_ctx, req) => {
            return {
                id: '123',
                name: req.data?.name || 'Unknown',
            }
        })

        const client = new TestClient(server.getUrl())
        await client.connect()

        const response = await client.client.post('/api/users', {name: 'Test User'})

        expect(response).toBeDefined()
        expect((response as any).id).toBe('123')
        expect((response as any).name).toBe('Test User')

        client.disconnect()
    })

    test('should handle multiple concurrent requests', async() => {
        server = new TestServer()
        await server.start()

        server.wsManager.api.get('/api/test/:id', async(_ctx, req) => {
            return {id: req.params.id}
        })

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Send multiple requests concurrently
        const promises = [
            client.client.get('/api/test/1'),
            client.client.get('/api/test/2'),
            client.client.get('/api/test/3'),
        ]

        const responses = await Promise.all(promises)

        expect(responses).toHaveLength(3)
        expect((responses[0] as any).id).toBe('1')
        expect((responses[1] as any).id).toBe('2')
        expect((responses[2] as any).id).toBe('3')

        client.disconnect()
    })
})

describe('WebSocket Integration - Broadcasting', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should broadcast to all connected clients', async() => {
        server = new TestServer()
        await server.start()

        const client1 = new TestClient(server.getUrl())
        await client1.connect()

        const client2 = new TestClient(server.getUrl())
        await client2.connect()

        // Clear messages
        client1.clearMessages()
        client2.clearMessages()

        // Broadcast message
        server.wsManager.broadcast('/test', {message: 'broadcast'})

        // Wait for messages
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Both clients should receive the broadcast
        expect(client1.messages.length).toBeGreaterThan(0)
        expect(client2.messages.length).toBeGreaterThan(0)

        client1.disconnect()
        client2.disconnect()
    })

    test('should handle broadcast with dead connections', async() => {
        server = new TestServer()
        await server.start()

        const client1 = new TestClient(server.getUrl())
        await client1.connect()

        const client2 = new TestClient(server.getUrl())
        await client2.connect()

        // Close one connection
        client1.disconnect()
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Broadcast should not crash
        expect(() => {
            server.wsManager.broadcast('/test', {message: 'test'})
        }).not.toThrow()

        // Only live client should receive message
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(client2.messages.length).toBeGreaterThan(0)

        client2.disconnect()
    })
})

describe('WebSocket Integration - Error Propagation', () => {
    let server: TestServer

    afterEach(() => {
        if (server) {
            server.stop()
        }
    })

    test('should propagate errors from handler to client', async() => {
        server = new TestServer()
        await server.start()

        server.wsManager.api.get('/api/error', async() => {
            throw new Error('Test error')
        })

        const client = new TestClient(server.getUrl())
        await client.connect()

        const response = await client.client.get('/api/error')

        expect(response).toBeDefined()
        expect((response as any).error).toBe('Test error')

        client.disconnect()
    })

    test('should handle multiple error scenarios', async() => {
        server = new TestServer()
        await server.start()

        const client = new TestClient(server.getUrl())
        await client.connect()

        // Test invalid JSON
        const ws = (client.client as any).ws
        if (ws) {
            ws.send('invalid json')
        }

        await new Promise((resolve) => setTimeout(resolve, 100))

        // Test missing route
        const noRouteResponse = await client.client.get('/api/nonexistent')
        expect((noRouteResponse as any).error).toContain('No route matched')

        client.disconnect()
    })
})
