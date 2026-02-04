# WebSocket Protocol Guide

**Purpose**: Comprehensive guide to the Garage44 WebSocket protocol for agents and developers. This protocol provides URL-based routing, request/response patterns, and pub/sub subscriptions over WebSocket.

## Overview

The Garage44 workspace uses a custom WebSocket protocol built on Bun's native WebSocket support (ADR-004, ADR-006). The protocol provides:

- **URL-based routing**: Routes messages like REST APIs but over WebSocket
- **Request/response pattern**: Request messages with IDs get matched responses
- **Pub/sub subscriptions**: Subscribe to topics for real-time updates
- **Automatic reconnection**: Client automatically reconnects with exponential backoff
- **Error handling**: Standardized error responses for all failure cases

## Message Format

### Request Message

```typescript
{
  url: string        // Route path (e.g., "/api/tickets", "/api/tickets/:id/comments")
  method: string     // HTTP method: "GET", "POST", "PUT", "DELETE"
  data?: object      // Request payload (optional)
  id?: string        // Request ID for response matching (optional, but recommended)
}
```

**Example Request:**
```json
{
  "url": "/api/tickets/abc123/comments",
  "method": "POST",
  "data": {
    "content": "This is a comment",
    "author_id": "user123"
  },
  "id": "req-123"
}
```

### Response Message

```typescript
{
  url: string        // Same as request URL
  id?: string        // Same as request ID (for matching)
  data?: object      // Response payload (on success)
  error?: string      // Error message (on error)
}
```

**Example Success Response:**
```json
{
  "url": "/api/tickets/abc123/comments",
  "id": "req-123",
  "data": {
    "id": "comment-456",
    "content": "This is a comment",
    "created_at": 1234567890
  }
}
```

**Example Error Response:**
```json
{
  "url": "/api/tickets/abc123/comments",
  "id": "req-123",
  "error": "Missing required field: content"
}
```

## URL-Based Routing

Routes are registered using HTTP-like patterns with path parameters:

```typescript
// Register a route handler
wsManager.api.get('/api/tickets', async(ctx, req) => {
  return {tickets: [...]}
})

wsManager.api.post('/api/tickets/:id/comments', async(ctx, req) => {
  const ticketId = req.params.id  // Extract from URL
  const commentData = req.data     // Request body
  return {id: 'comment-123', ...commentData}
})
```

**Route Matching:**
- Uses `path-to-regexp` patterns (same as Express.js routes)
- Supports path parameters: `/api/tickets/:id`
- Matches both URL pattern AND HTTP method
- Query parameters parsed automatically: `/api/tickets?status=open`

**Route Parameters:**
```typescript
// Route: /api/tickets/:id/comments
// Request: {url: "/api/tickets/abc123/comments", method: "POST"}
// Access: req.params.id === "abc123"
```

## Request/Response Pattern

### Making Requests

**Client-side (WebSocketClient):**
```typescript
import {WebSocketClient} from '@garage44/common/lib/ws-client'

const ws = new WebSocketClient('ws://localhost:3030/ws')
ws.connect()

// GET request
const tickets = await ws.get('/api/tickets')

// POST request with data
const comment = await ws.post('/api/tickets/abc123/comments', {
  content: 'Hello',
  author_id: 'user123'
})

// PUT request
await ws.put('/api/tickets/abc123', {
  status: 'closed'
})

// DELETE request
await ws.delete('/api/tickets/abc123')
```

**Server-side Handler:**
```typescript
wsManager.api.post('/api/tickets/:id/comments', async(ctx, req) => {
  // ctx.ws - WebSocket connection
  // ctx.session - User session (if authenticated)
  // ctx.broadcast() - Broadcast to all connections
  // ctx.subscribe() - Subscribe connection to topic
  // req.params - URL parameters
  // req.query - Query parameters
  // req.data - Request body
  // req.id - Request ID

  const ticketId = req.params.id
  const comment = createComment(ticketId, req.data)

  // Return response (automatically sent to client)
  return {id: comment.id, ...comment}
})
```

### Response Matching

Requests with an `id` field automatically match responses:
- Client sends: `{url: "/api/test", method: "GET", id: "req-123"}`
- Server responds: `{url: "/api/test", id: "req-123", data: {...}}`
- Client matches response to pending request using `id`

Requests without `id` are fire-and-forget (no response expected).

## Subscriptions and Broadcasting

### Subscribing to Topics

**Client-side:**
```typescript
// Subscribe to a topic
ws.onRoute('/agents/Prioritizer/mentions', (data) => {
  console.log('Received mention:', data)
})

// Or use event emitter pattern
ws.on('/agents/Prioritizer/mentions', (data) => {
  console.log('Received mention:', data)
})
```

**Server-side:**
```typescript
// In handler, subscribe connection to topic
wsManager.api.post('/api/subscribe', async(ctx, req) => {
  ctx.subscribe?.(req.data.topic)
  return {success: true}
})
```

### Broadcasting Messages

**Server-side:**
```typescript
// Broadcast to all connections
wsManager.broadcast('/tickets', {
  ticketId: 'abc123',
  type: 'ticket:updated'
})

// Emit to subscribed connections only
wsManager.emitEvent('/agents/Prioritizer/mentions', {
  comment_id: 'comment-123',
  ticket_id: 'ticket-456',
  comment_content: '@Prioritizer please review'
})
```

**Broadcast vs EmitEvent:**
- `broadcast()`: Sends to ALL connected clients
- `emitEvent()`: Sends only to clients subscribed to the topic

## Error Handling

### Error Response Format

All errors return standardized error responses:

```typescript
{
  url: string        // Request URL (or "/error" for parse errors)
  id?: string        // Request ID (if provided)
  error: string      // Error message
}
```

### Error Scenarios

1. **Invalid JSON**: Message cannot be parsed
   ```json
   {"url": "/error", "error": "Invalid JSON message"}
   ```

2. **Missing Required Field**: Message missing `url` field
   ```json
   {"url": "/error", "error": "Missing required field: url"}
   ```

3. **No Route Matched**: No handler found for URL/method
   ```json
   {"url": "/api/nonexistent", "id": "req-123", "error": "No route matched for: GET /api/nonexistent"}
   ```

4. **Handler Error**: Handler throws exception
   ```json
   {"url": "/api/tickets", "id": "req-123", "error": "Handler error message"}
   ```

### Error Handling Best Practices

**Client-side:**
```typescript
try {
  const response = await ws.post('/api/tickets', data)
  if (response.error) {
    console.error('Server error:', response.error)
    return
  }
  // Handle success
} catch (error) {
  console.error('Request failed:', error)
}
```

**Server-side:**
```typescript
wsManager.api.post('/api/tickets', async(ctx, req) => {
  try {
    // Validate input
    if (!req.data.title) {
      throw new Error('Missing required field: title')
    }
    // Process request
    return {success: true}
  } catch (error) {
    // Error automatically sent to client
    throw error
  }
})
```

## Connection Lifecycle

### Connection Establishment

**Client:**
```typescript
const ws = new WebSocketClient('ws://localhost:3030/ws')

ws.on('open', () => {
  console.log('Connected')
})

ws.on('close', (event) => {
  console.log('Disconnected:', event.code, event.reason)
})

ws.on('error', (error) => {
  console.error('Connection error:', error)
})

ws.connect()
```

**Server:**
```typescript
// Connection automatically tracked in wsManager.connections
// Authentication checked in wsManager.open()
```

### Reconnection

Client automatically reconnects with exponential backoff:
- Base delay: 100ms
- Max delay: 30 seconds
- Max attempts: 10
- Does NOT reconnect on authentication failure (1008)

**Reconnection Events:**
```typescript
ws.on('reconnecting', ({attempt, delay}) => {
  console.log(`Reconnecting attempt ${attempt} in ${delay}ms`)
})

ws.on('max_reconnect_attempts', () => {
  console.log('Max reconnection attempts reached')
})
```

### Connection Cleanup

**Dead Connection Detection:**
- Connections with `readyState !== 1` are considered dead
- Dead connections automatically cleaned up during broadcasts
- Manual cleanup: `wsManager.cleanupDeadConnections()`

## Examples

### Complete Request/Response Example

**Client:**
```typescript
const ws = new WebSocketClient('ws://localhost:3030/ws')
await ws.connect()

// Create a ticket
const ticket = await ws.post('/api/tickets', {
  title: 'Fix bug',
  description: 'Bug description'
})

console.log('Created ticket:', ticket.id)
```

**Server:**
```typescript
wsManager.api.post('/api/tickets', async(ctx, req) => {
  const ticket = {
    id: randomId(),
    title: req.data.title,
    description: req.data.description,
    created_at: Date.now()
  }

  // Save to database
  saveTicket(ticket)

  // Broadcast update to all clients
  ctx.broadcast('/tickets', {
    type: 'ticket:created',
    ticket
  })

  return ticket
})
```

### Subscription Example

**Client subscribes to agent mentions:**
```typescript
const ws = new WebSocketClient('ws://localhost:3030/ws')
await ws.connect()

// Subscribe to mentions
ws.onRoute('/agents/Prioritizer/mentions', (data) => {
  console.log('Mention received:', data)
  // Process mention...
})
```

**Server broadcasts mention:**
```typescript
// When comment with @Prioritizer is created
wsManager.emitEvent('/agents/Prioritizer/mentions', {
  comment_id: commentId,
  ticket_id: ticketId,
  comment_content: content,
  author_id: authorId
})
```

## Agent Usage Guidelines

### For Agent Services

When implementing agent services that connect as WebSocket clients:

1. **Connect to Main Service:**
   ```typescript
   import {WebSocketClient} from '@garage44/common/lib/ws-client'

   const ws = new WebSocketClient('ws://localhost:3030/ws')
   await ws.connect()
   ```

2. **Subscribe to Agent-Specific Topics:**
   ```typescript
   ws.onRoute(`/agents/${agentId}/mentions`, async(data) => {
     // Process mention
     await processMention(data)
   })
   ```

3. **Handle Reconnection:**
   ```typescript
   ws.on('reconnecting', ({attempt}) => {
     logger.info(`Reconnecting attempt ${attempt}`)
   })

   ws.on('max_reconnect_attempts', () => {
     logger.error('Failed to reconnect, giving up')
   })
   ```

4. **Error Handling:**
   ```typescript
   ws.on('error', (error) => {
     logger.error('WebSocket error:', error)
   })
   ```

### Best Practices

- Always include `id` in requests that need responses
- Handle error responses in all request handlers
- Subscribe to topics instead of polling
- Use `emitEvent()` for targeted notifications, `broadcast()` for general updates
- Clean up subscriptions when connection closes
- Handle reconnection gracefully

## Protocol Implementation Details

### Message Serialization

- All messages sent as JSON strings over WebSocket
- Server validates JSON before processing
- Client validates message structure before handling

### Connection State

- `readyState === 1`: Connection is OPEN
- `readyState !== 1`: Connection is dead (CLOSING, CLOSED, CONNECTING)
- Dead connections automatically cleaned up

### Robustness Features

- **Error Isolation**: One connection failure doesn't crash broadcasts
- **Dead Connection Cleanup**: Dead connections removed automatically
- **Error Responses**: All errors return standardized responses
- **Message Validation**: Invalid messages handled gracefully
- **Reconnection**: Automatic reconnection with backoff

## Related ADRs

- **ADR-004**: Preact + WebSocket Real-time Architecture
- **ADR-006**: REST to WebSocket Migration
- **ADR-028**: Agent Mention Processing with WebSocket Push
- **ADR-029**: WebSocket Robustness Improvements and Protocol Documentation

## Testing

See `packages/common/tests/ws-*.test.ts` for comprehensive test suite that serves as executable documentation of protocol behavior.
