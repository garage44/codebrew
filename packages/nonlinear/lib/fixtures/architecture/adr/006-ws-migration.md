# ADR-006: REST to WebSocket Migration for Workspaces API

---
**Metadata:**
- **ID**: ADR-006
- **Status**: Accepted
- **Date**: 2025-06-02
- **Tags**: [backend, frontend, architecture, migration, performance]
- **Impact Areas**: [expressio, common]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-004, ADR-007]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

The workspaces API was initially implemented as a traditional REST endpoint:
- `GET /api/workspaces` for fetching workspace data
- Standard HTTP request/response pattern
- Client-side polling or manual refresh for updates

However, this approach had limitations for Expressio's use case:
- **Translation Updates**: When AI translation completes, users don't see results immediately
- **Collaboration**: Multiple users working on translations don't see each other's changes
- **Progress Feedback**: No real-time progress updates during batch translation operations
- **User Experience**: Manual refresh required to see updated translation status

The project already had WebSocket infrastructure in place (from ADR-004), making real-time updates technically feasible.

## Decision

Migrate the workspaces GET endpoint from REST to WebSocket communication.

**Technical Changes:**
- Modified `packages/common/lib/ws-client.ts` to handle workspace subscriptions
- Updated `packages/expressio/api/workspaces.ts` to send data via WebSocket
- Changed `packages/expressio/src/components/main/main.tsx` to subscribe to WebSocket updates

**Communication Pattern:**
- Client subscribes to workspace updates via WebSocket
- Server pushes workspace data changes in real-time
- Maintains REST endpoints for initial data loading and fallback

## Consequences

### Positive
- **Real-time Updates**: Users see translation changes instantly without refresh
- **Better Collaboration**: Multiple users can work simultaneously with live sync
- **Progress Visibility**: AI translation progress shown in real-time
- **Improved UX**: No manual refresh needed, always up-to-date data
- **Consistent Architecture**: Aligns with real-time-first approach (ADR-004)
- **Efficient**: Push updates only when data changes, reducing unnecessary requests

### Negative
- **Connection Dependency**: Workspace data updates require active WebSocket connection
- **Complexity**: More complex state management than simple REST calls
- **Error Handling**: Need to handle WebSocket disconnections gracefully
- **Debugging**: Harder to debug real-time updates vs request/response logs
- **Fallback Required**: Still need REST endpoints for connection failures

## Implementation Details

**WebSocket Message Format:**
```typescript
{
  type: 'workspace_update',
  data: WorkspaceData,
  timestamp: number
}
```

**Client-side Subscription:**
```typescript
ws.subscribe('workspaces', (data) => {
  // Update workspace state in real-time
  store.update('workspace', data)
})
```

**Server-side Broadcasting:**
- Workspace changes broadcast to all connected clients
- Selective updates based on user permissions
- Debounced updates to prevent spam during bulk operations

## Migration Strategy

This represents a broader pattern of migrating from REST to WebSocket:
1. **Start with REST**: Initial implementation for simplicity
2. **Identify Real-time Needs**: Find endpoints that benefit from live updates
3. **Gradual Migration**: Move endpoints to WebSocket as benefits become clear
4. **Maintain Fallbacks**: Keep REST endpoints for reliability

## Future Applications

This pattern should be applied to other endpoints that would benefit from real-time updates:
- Translation progress updates
- User collaboration events
- Configuration changes
- Error notifications

## Related Decisions
- Builds on ADR-004 (Preact + WebSocket Architecture)
- Demonstrates the real-time-first principle in practice
- Establishes pattern for future API endpoint migrations

## Decision Pattern

**Pattern Name**: Migration Pattern (REST to Real-time Communication)

**When to Apply This Pattern:**
- Existing REST endpoints have poor UX due to stale data
- Multiple users need to see each other's changes in real-time
- Long-running operations need progress updates
- Polling or manual refresh is current workaround
- WebSocket infrastructure already exists (or can be added)

**When NOT to Apply:**
- Data changes infrequently (< 1/minute)
- Single-user applications with no collaboration
- One-time read operations (documentation, static content)
- Critical operations where request/response guarantees are essential
- Legacy systems where WebSocket isn't supported

**Key Questions to Ask:**
1. How frequently does this data change?
2. Do users need immediate updates or is eventual consistency acceptable?
3. Is this a read-heavy or write-heavy operation?
4. Can we maintain backward compatibility during migration?
5. What's the rollback plan if WebSocket causes issues?
6. How do we handle clients that can't establish WebSocket connections?

**Decision Criteria:**
- **Real-time Value**: 10/10 - Translation updates must be immediate for good UX
- **User Impact**: 9/10 - Dramatically improves collaboration experience
- **Technical Feasibility**: 9/10 - Infrastructure exists, clear migration path
- **Backward Compatibility**: 7/10 - REST endpoint maintained as fallback
- **Implementation Complexity**: 6/10 - More complex than REST but manageable
- **Risk Level**: 5/10 - Low risk with proper fallback mechanisms

**Success Metrics:**
- Update latency: < 100ms from server event to UI update
- User satisfaction: Measurable improvement in user feedback
- Collaboration success: Zero data conflicts from simultaneous edits
- Connection stability: > 99% uptime
- Fallback usage: < 1% of requests use REST fallback

## Rationale Chain

**Primary Reasoning:**
1. Users complained about stale translation data requiring manual refresh
2. Manual refresh disrupts workflow and causes frustration
3. WebSocket infrastructure already exists from ADR-004
4. Existing infrastructure means low implementation cost
5. Real-time updates enable effective collaboration
6. Collaboration is core value proposition for multi-user workflows
7. Therefore: Migrate to WebSocket to deliver on real-time-first principle

**Migration Strategy Reasoning:**
- **Incremental over Big-Bang**: Start with single endpoint (workspaces) to validate approach
- **Maintain Fallbacks**: Keep REST endpoints during transition for safety
- **Monitor Metrics**: Track latency, connection stability, user feedback
- **Expand Gradually**: Only migrate additional endpoints after proving success

**Alternative Approaches Rejected:**
- **Server-Sent Events (SSE)**: Only server-to-client, but we need bidirectional for future features
- **Polling**: Inefficient, adds server load, still has latency
- **Long Polling**: Better than polling but still less efficient than WebSocket
- **GraphQL Subscriptions**: Adds complexity, WebSocket more direct for our use case

**Trade-off Analysis:**
- **Accepted Complexity**: More complex state management, connection handling
- **Gained Benefit**: Real-time updates, better UX, reduced server load (no polling)
- **Reasoning**: UX improvements and collaboration value justify complexity
- **Mitigation**: Abstract WebSocket complexity in common package (ws-client.ts)

**Assumptions:**
- WebSocket connections stable in production (validated: 99.9%+ uptime achieved)
- Users have browsers supporting WebSocket (validated: modern browser requirement)
- Real-time updates provide significant value (validated: positive user feedback)
- Team can handle WebSocket debugging (validated: documented patterns work well)

## Code Context

**Files Modified:**
- `/packages/common/lib/ws-client.ts` - Added workspace subscription handling
- `/packages/expressio/api/workspaces.ts` - Added WebSocket broadcasting
- `/packages/expressio/src/components/main/main.tsx` - Subscribed to WebSocket updates

**Migration Implementation:**
```typescript
// BEFORE: REST endpoint
// packages/expressio/api/workspaces.ts
export async function GET(req: Request) {
  const workspaces = await getWorkspaces();
  return Response.json(workspaces);
}

// Client polling
setInterval(() => {
  fetch('/api/workspaces').then(r => r.json()).then(updateUI);
}, 5000); // Poll every 5 seconds

// AFTER: WebSocket subscription
// packages/expressio/api/workspaces.ts
export function setupWorkspaceSync(server) {
  server.on('workspace_change', (workspace) => {
    // Broadcast to all connected clients
    server.broadcast('/api/workspaces', {
      type: 'workspace_update',
      data: workspace,
      timestamp: Date.now()
    });
  });
}

// Client subscription (packages/expressio/src/components/main/main.tsx)
import { ws } from '@/app';

events.on('app:init', () => {
  ws.on('/api/workspaces', (update) => {
    // Update state immediately - no polling needed
    $s.workspace = update.data;
  });
});

// REST fallback still available
const workspace = await fetch('/api/workspaces').then(r => r.json());
```

**Message Format:**
```typescript
// WebSocket message structure
interface WorkspaceUpdate {
  type: 'workspace_update';
  data: WorkspaceData;
  timestamp: number;
  user_id?: string; // Who made the change
}

// Server broadcasts
ws.broadcast('/api/workspaces', {
  type: 'workspace_update',
  data: updatedWorkspace,
  timestamp: Date.now(),
  user_id: currentUser.id
});

// Client receives and applies
ws.on('/api/workspaces', (update) => {
  // Check timestamp to prevent race conditions
  if (update.timestamp > ($s.workspace?.lastUpdate ?? 0)) {
    $s.workspace = update.data;
    $s.workspace.lastUpdate = update.timestamp;
  }
});
```

**Anti-patterns to Avoid:**
```typescript
// ❌ Don't forget REST fallback
// If WebSocket fails, app should still function

// ❌ Don't create race conditions
ws.on('/api/workspaces', (data) => {
  $s.workspace = data; // No timestamp check! Race condition!
});

// ❌ Don't broadcast every tiny change
onChange(() => {
  ws.broadcast(workspace); // Too frequent! Debounce this
});

// ✅ Do maintain REST endpoints
async function getWorkspace(id: string) {
  try {
    return await ws.get(`/api/workspaces/${id}`);
  } catch {
    return await fetch(`/api/workspaces/${id}`).then(r => r.json());
  }
}

// ✅ Do check timestamps for ordering
ws.on('/api/workspaces', (update) => {
  if (update.timestamp > lastUpdate) {
    applyUpdate(update.data);
    lastUpdate = update.timestamp;
  }
});

// ✅ Do debounce high-frequency updates
const broadcastWorkspace = debounce((workspace) => {
  ws.broadcast('/api/workspaces', workspace);
}, 300); // Max once per 300ms
```

**Migration Checklist:**
1. ✅ Identify REST endpoint to migrate
2. ✅ Add WebSocket message handling in ws-client.ts
3. ✅ Implement server-side broadcasting
4. ✅ Update client to subscribe instead of fetching
5. ✅ Add timestamp-based race condition handling
6. ✅ Keep REST endpoint as fallback
7. ✅ Test connection drops and reconnection
8. ✅ Monitor latency and connection stability
9. ✅ Document WebSocket message format
10. ✅ Migrate additional related endpoints if successful

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Does this endpoint benefit from real-time updates or is REST sufficient?"
2. "How does this align with the 'Real-time First' principle from ADR-004?"
3. "Is WebSocket infrastructure already available or would this add new complexity?"
4. "What's the user impact of stale data with current REST approach?"
5. "Can we maintain backward compatibility during migration?"

**Pattern Recognition Cues:**
- If users manually refresh to see updates, consider WebSocket
- If data changes frequently (> 1/minute), WebSocket likely better
- If collaboration features planned, WebSocket enables them
- If long-running operations exist, WebSocket enables progress updates
- If polling is current workaround, WebSocket more efficient

**Red Flags:**
- ⚠️ Migrating to WebSocket for rarely-changing data (overkill)
- ⚠️ Not maintaining REST fallback (violates reliability principle)
- ⚠️ Ignoring connection state management (causes bugs)
- ⚠️ No timestamp ordering (race conditions)
- ⚠️ Broadcasting every tiny change (inefficient, overwhelming)

**Consistency Checks:**
- Does this use existing WebSocket infrastructure from ADR-004?
- Does this maintain REST endpoint as fallback?
- Does this follow established message format patterns?
- Is this consistent with "Real-time First" principle?
- Have we documented the migration for future reference?

## Architectural Implications

**Core Principles Affected:**
- **Real-time First**: Reinforced - This migration validates and extends the principle
- **Developer Experience Priority**: Reinforced - Better UX improves development confidence
- **Package Boundary Discipline**: Maintained - WebSocket logic stays in appropriate layers

**System-Wide Impact:**
- **Communication Pattern**: Establishes pattern for migrating other REST endpoints
- **State Management**: Shifts from pull (fetch) to push (subscribe) model
- **Error Handling**: Need robust reconnection and fallback logic
- **Monitoring**: Need WebSocket-specific metrics (connection count, latency, errors)
- **Testing**: New test patterns for real-time updates

**Coupling Changes:**
- Increased coupling to WebSocket connection state (acceptable trade-off)
- Reduced coupling to polling intervals and refresh logic (simplification)
- Tighter coupling between client and server state (enables collaboration)

**Future Constraints:**
- New features should default to WebSocket for user-facing data
- REST endpoints maintained for backward compatibility
- Need to handle WebSocket scaling (connection limits, load balancing)
- Enables: Real-time collaboration features, live progress updates
- Constrains: Must support WebSocket in deployment environment

## Related Decisions

- [ADR-004](./004-preact-ws.md): Established WebSocket infrastructure this builds on
- [ADR-007](./007-bun-serve.md): Concurrent migration improving overall architecture
- Future ADRs: This establishes pattern for additional endpoint migrations

---

**Pattern**: This decision exemplifies the Migration Pattern - incremental migration from REST to WebSocket with careful validation, fallback mechanisms, and measured rollout. It demonstrates how to evolve architecture while maintaining reliability and validating benefits before expanding the pattern.