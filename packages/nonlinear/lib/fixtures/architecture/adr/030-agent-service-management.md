# ADR-030: Agent Service Management via WebSocket

---
**Metadata:**
- **ID**: ADR-030
- **Status**: Proposed
- **Date**: 2025-02-05
- **Tags**: [architecture, ai, automation, nonlinear, websocket, observability]
- **Impact Areas**: [nonlinear]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-021, ADR-028, ADR-029]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

Nonlinear's agent system (ADR-021, ADR-028) lacks visibility into agent service status and task statistics. Users cannot see which agent services are online, view task completion metrics, or manage services from the UI.

**Current Limitations:**

1. No service status visibility - cannot see if agent services are running
2. No task statistics - no visibility into pending/completed/failed tasks
3. No service management - must use console/systemd to start/stop services
4. Process-based detection would require PID tracking and parsing command lines

**Requirements:**

- Display agent task statistics (pending, processing, completed, failed)
- Show service online/offline status
- Start/stop agent services from UI
- Work for services started from console, systemd, or API

**Alternatives Considered:**

1. **Process Detection**: Parse running processes to detect services
   - ❌ Complex command-line parsing
   - ❌ Doesn't work reliably across platforms
   - ❌ Requires PID tracking

2. **WebSocket Subscription Checking**: Check if agent services are subscribed to their task topics
   - ✅ Simple - uses existing subscription tracking
   - ✅ Works for all startup methods (console, systemd, API)
   - ✅ Real-time connection status
   - ✅ No PID tracking needed

3. **Stop via PID Kill**: Kill processes by PID to stop services
   - ❌ Only works for API-started services
   - ❌ Requires PID tracking
   - ❌ Doesn't work for externally-started services

4. **Stop via WebSocket**: Send stop message via WebSocket
   - ✅ Works for all services regardless of startup method
   - ✅ Graceful shutdown (agents can finish current task)
   - ✅ No PID tracking needed

## Decision

Implement **Agent Service Management via WebSocket**:

### 1. **Service Status Detection**

Check WebSocket subscriptions to determine if agent services are online:
- Check `wsManager.subscriptions['/agents/:agentId/tasks']` for active subscriptions
- Returns `true` if any connections are subscribed to the agent's task topic
- Works universally for console, systemd, and API-started services

### 2. **Task Statistics**

Expose task statistics via API:
- Use existing `getTaskStats(agentId)` function
- Returns counts: `pending`, `processing`, `completed`, `failed`
- Display in agents settings UI

### 3. **Service Management**

**Start Service:**
- Spawn background process via Bun.spawn
- Use WebSocket URL from agent config (or default from ENV)
- Process connects and subscribes to task topic

**Stop Service:**
- Send WebSocket message to `/agents/:agentId/stop` topic
- Agent services listen for stop events and shut down gracefully
- Works for all services regardless of startup method

### 4. **Agent Service Stop Handler**

Agent services listen for stop events:
- Subscribe to `/agents/:agentId/stop` topic in `AgentService.initWebSocket()`
- On stop event, call `service.stop()` and `process.exit(0)`
- Graceful shutdown - finishes current task if processing

## Consequences

**Benefits:**
- Universal service detection (works for all startup methods)
- Simple implementation (uses existing WebSocket infrastructure)
- Graceful shutdown (agents finish current work)
- Real-time status updates
- No PID tracking complexity

**Trade-offs:**
- Stop command only works if service is connected (expected behavior)
- Requires agent services to listen for stop events (one-time implementation)

**Implementation Notes:**
- Add stop event listener to `AgentService` class
- Add API endpoints: `/api/agents/:id/stats`, `/api/agents/:id/service-status`, `/api/agents/:id/service/start`, `/api/agents/:id/service/stop`
- Enhance `/api/agents` endpoint to include stats and service status
- Update agents settings UI to display stats and service controls
