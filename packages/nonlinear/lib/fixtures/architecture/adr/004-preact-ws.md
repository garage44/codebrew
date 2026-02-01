# ADR-004: Preact + WebSocket Real-time Architecture

---
**Metadata:**
- **ID**: ADR-004
- **Status**: Accepted
- **Date**: 2025-04-17
- **Tags**: [frontend, backend, architecture, performance, ux]
- **Impact Areas**: [expressio, pyrite, common]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-001, ADR-003, ADR-006, ADR-012]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

Expressio requires a user interface for translation management with the following needs:

**Frontend Requirements:**
- Interactive translation editing interface
- Real-time updates when translations change
- Lightweight bundle size for fast loading
- Modern component-based architecture
- TypeScript support

**Communication Requirements:**
- Live synchronization of translation updates
- Multiple user collaboration support
- Instant feedback on translation operations
- Background AI translation progress updates

**Architecture Options Considered:**
- **React + REST API**: Traditional, but limited real-time capabilities
- **Vue + Server-Sent Events**: Good real-time, but one-way communication
- **React + WebSocket**: Full real-time, but larger bundle size
- **Preact + WebSocket**: Lightweight real-time solution

## Decision

Implement a real-time architecture using:

**Frontend: Preact**
- Lightweight React alternative (~3KB vs 45KB)
- Component-based architecture with hooks
- JSX support with `jsxImportSource: "preact"`
- Full TypeScript integration

**Communication: WebSocket-first**
- Primary communication via WebSocket (`ws://hostname:3030/ws`)
- Real-time bidirectional updates
- Fallback REST endpoints where appropriate
- Custom WebSocket client in `common/lib/ws-client.ts`

**State Management:**
- Custom store system in `common/lib/store.ts`
- WebSocket-driven state updates
- Persistent and volatile state separation

## Architecture Diagram

### Communication Flow

```mermaid
sequenceDiagram
    participant UI as Preact Component
    participant WS as "WSClient<br/>common/lib/ws-client.ts"
    participant Server as "Bun Server<br/>Bun.serve"
    participant State as "Global State<br/>$s"

    Note over UI,State: Initial Connection
    UI->>WS: ws.connect()
    WS->>Server: WebSocket Connection
    Server->>WS: /i18n/state (full sync)
    WS->>State: Update $s.workspace.i18n
    State->>UI: Reactive update (DeepSignal)

    Note over UI,State: Real-time Update
    Server->>WS: /i18n/sync (delta)
    WS->>State: pathUpdate($s.workspace.i18n, path, value)
    State->>UI: Automatic re-render

    Note over UI,State: User Action
    UI->>WS: ws.post('/api/workspaces/123/translate')
    WS->>Server: POST request
    Server->>WS: /i18n/sync (response)
    WS->>State: Apply changes
    State->>UI: UI updates
```

### Component Architecture

```mermaid
graph TB
    subgraph "Frontend (Preact)"
        Component[Preact Component]
        DeepSignal["DeepSignal State<br/>deepSignal reactive state"]
        WSClient["WSClient<br/>from @/app"]
    end

    subgraph "Common Package"
        WSClientLib["ws-client.ts<br/>WebSocket abstraction"]
        StoreLib["store.ts<br/>State management"]
    end

    subgraph "Backend (Bun)"
        BunServer["Bun.serve<br/>HTTP + WebSocket"]
        WSServer["ws-server.ts<br/>WebSocket handlers"]
    end

    Component --> DeepSignal
    Component --> WSClient
    WSClient --> WSClientLib
    WSClientLib --> BunServer
    BunServer --> WSServer
    WSServer -.->|events| WSClientLib
    WSClientLib -.->|updates| StoreLib
    StoreLib -.->|reactive| Component
```

**Pattern**: WebSocket-first for real-time, DeepSignal for reactive state, Preact for lightweight UI.

## Consequences

### Positive
- **Performance**: Significantly smaller bundle size than React
- **Real-time UX**: Instant updates across all connected clients
- **Collaboration**: Multiple users can work simultaneously
- **Progress Feedback**: Live AI translation progress updates
- **Scalability**: WebSocket connections more efficient than polling
- **Developer Experience**: Familiar React-like API with hooks

### Negative
- **Ecosystem**: Smaller component library ecosystem than React
- **Complexity**: WebSocket state management more complex than REST
- **Connection Management**: Need to handle disconnections and reconnects
- **Browser Support**: WebSocket not supported in very old browsers
- **Debugging**: Real-time updates harder to debug than request/response

## Implementation Details

**Frontend Structure:**
```
src/components/
├── elements/     # Reusable UI components
├── pages/        # Route-level components
└── main/         # Root application component
```

**WebSocket Communication:**
- Connection established in `app.ts`
- Subscription system for different data types
- Automatic reconnection handling
- Message queuing during disconnections

**State Architecture:**
- `persistantState`: Saved to localStorage
- `volatileState`: Session-only data
- WebSocket messages update state directly
- Components subscribe to specific state slices

## Migration Path
As evidenced by commit `7d98433`, we actively migrate REST endpoints to WebSocket:
- Started with REST API for initial implementation
- Migrate endpoints to WebSocket as real-time benefits become clear
- Maintain REST fallbacks for critical operations

## Future Considerations
- Monitor Preact ecosystem development
- Consider Server-Sent Events for one-way updates if WebSocket proves complex
- Evaluate React migration if Preact limitations become significant
- Consider WebRTC for direct peer-to-peer collaboration features

## Decision Pattern

**Pattern Name**: Architecture Pattern (Real-time Frontend Communication)

**When to Apply This Pattern:**
- Building collaborative applications with real-time updates
- User interfaces that need live data synchronization
- Applications with frequent bidirectional client-server communication
- Features requiring progress feedback or live notifications

**When NOT to Apply:**
- Simple CRUD applications without real-time requirements
- Read-only documentation sites
- Applications requiring legacy browser support
- Use cases with infrequent, one-directional updates (consider SSE)

**Key Questions to Ask:**
1. Do users need to see changes from other users in real-time?
2. Are there long-running operations that need progress updates?
3. Is bidirectional communication required, or only server→client?
4. What's the expected connection count and how will it scale?
5. How do we handle connection failures and reconnection?

**Decision Criteria:**
- **Real-time Need**: 10/10 - Translation updates must be immediate
- **Collaboration**: 9/10 - Multiple users working simultaneously
- **Performance**: 8/10 - Lightweight bundle, efficient updates
- **Complexity**: 6/10 - More complex than REST, but manageable
- **Scalability**: 8/10 - WebSocket scales well with proper architecture
- **Developer Experience**: 8/10 - Preact familiar, WebSocket well-understood

**Success Metrics:**
- Update latency: < 100ms from server event to UI update
- Connection stability: > 99.9% uptime
- Bundle size: < 50KB total JavaScript (Preact ~3KB)
- Developer velocity: Features delivered without slowing down

## Rationale Chain

**Primary Reasoning:**
1. We chose WebSocket because users need real-time translation updates
2. Real-time updates enable effective collaboration between multiple users
3. Collaboration improves productivity and prevents conflicts
4. We chose Preact because it provides React-like DX with 3KB footprint
5. Small footprint improves initial load time and performance
6. Better performance enhances user experience on slower connections
7. Custom store with WebSocket integration provides optimal state management

**Trade-off Analysis:**
- **Accepted Complexity**: WebSocket state management more complex than REST
- **Gained Benefit**: Instant updates, true real-time collaboration
- **Reasoning**: Real-time UX improvements justify additional complexity
- **Mitigation**: Custom store abstraction simplifies WebSocket usage for developers

**Architecture Decision Reasoning:**
- Preact over React: Bundle size reduction (3KB vs 45KB) with compatible API
- WebSocket over REST: Bidirectional real-time > request/response
- WebSocket over SSE: Future bidirectional needs, existing infrastructure
- Custom store over Redux: Simpler integration with WebSocket events
- DeepSignal over other state: Proxy-based reactivity, no boilerplate

**Assumptions:**
- WebSocket connections will be stable in target environments (validated: reliable in modern browsers)
- Preact compatibility with React ecosystem sufficient (validated: key libraries work)
- Team can manage WebSocket connection lifecycle (validated: abstracted in common package)
- Real-time updates provide significant UX value (validated: user feedback highly positive)

## Code Context

**Files Created:**
- `/packages/common/lib/ws-client.ts` - WebSocket client abstraction
- `/packages/common/lib/ws-server.ts` - WebSocket server helpers
- `/packages/common/lib/store.ts` - State management with WebSocket integration
- `/packages/*/src/app.ts` - Application entry points with WebSocket connection

**Implementation Pattern:**
```typescript
// WebSocket client setup (packages/common/lib/ws-client.ts)
export class WSClient {
  connect(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => this.handleMessage(event);
  }

  on(path: string, handler: (data: any) => void) {
    this.handlers.set(path, handler);
  }

  post(path: string, data: any) {
    this.send({ type: 'request', path, data });
  }
}

// Component using real-time updates (Preact)
import { ws } from '@/app';
import { $s } from '@/app'; // Global state
import { events } from '@garage44/common/app';

events.on('app:init', () => {
  // Subscribe to real-time translation updates
  ws.on('/i18n/sync', ({ create_tags, modify_tags, delete_tags }) => {
    // Update global state - UI reacts automatically
    for (const tag of create_tags) {
      pathCreate($s.workspace.i18n, tag.path, tag.value);
    }
    for (const tag of modify_tags) {
      pathUpdate($s.workspace.i18n, tag.path, tag.value);
    }
  });
});

// Preact component with DeepSignal state
import { deepSignal } from 'deepsignal';

const TranslationComponent = () => {
  const state = deepSignal({ filter: '', sort: 'asc' });

  return <div>
    <input
      value={state.filter}
      onInput={e => state.filter = e.target.value}
    />
    {$s.workspace.i18n
      .filter(t => t.key.includes(state.filter))
      .map(t => <TranslationItem key={t.id} translation={t} />)}
  </div>
};
```

**Anti-patterns to Avoid:**
```typescript
// ❌ Don't use useState instead of DeepSignal
import { useState } from 'preact/hooks';
const [count, setCount] = useState(0); // Wrong!

// ❌ Don't forget connection cleanup
useEffect(() => {
  ws.connect();
  // Missing: return () => ws.disconnect();
});

// ❌ Don't poll REST when WebSocket should be used
setInterval(() => fetch('/api/data'), 1000); // Wrong!

// ✅ Do use DeepSignal for reactive state
const state = deepSignal({ count: 0 });
state.count++; // Reactive, no setter needed

// ✅ Do clean up WebSocket subscriptions
events.on('app:init', () => {
  const unsub = ws.on('/updates', handler);
  return unsub; // Cleanup
});

// ✅ Do use WebSocket for real-time data
ws.on('/i18n/sync', (data) => {
  $s.workspace.i18n = data; // Automatic UI update
});
```

**Migration Path for Adding Real-time Features:**
1. Identify data that changes frequently or needs collaboration
2. Create WebSocket endpoint in API layer
3. Add subscription in component's `app:init` event
4. Update global state when WebSocket messages arrive
5. Remove polling or manual refresh logic
6. Test reconnection handling
7. Monitor WebSocket connection metrics

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Does this feature benefit from real-time updates or can it use REST?"
2. "Will multiple users need to see each other's changes?"
3. "Is this a request/response operation or an ongoing data stream?"
4. "How does this align with the 'Real-time First' principle?"
5. "Can we use existing WebSocket infrastructure or do we need new patterns?"

**Pattern Recognition Cues:**
- If building user-facing feature with changing data, consider WebSocket
- If users collaborate on shared resources, strongly favor WebSocket
- If long-running operations need progress updates, use WebSocket
- If data changes infrequently (< 1/minute), REST might be sufficient
- If one-way updates only, consider Server-Sent Events as simpler alternative

**Red Flags:**
- ⚠️ Using REST for frequently updated user-visible data (violates Real-time First)
- ⚠️ Adding polling instead of WebSocket subscription (inefficient anti-pattern)
- ⚠️ Using useState instead of DeepSignal in Preact (violates established pattern)
- ⚠️ Creating direct WebSocket connections instead of using ws-client.ts abstraction
- ⚠️ Mixing communication patterns (some features REST, others WebSocket) without clear reason

**Consistency Checks:**
- Does this use WebSocket from common/lib/ws-client.ts?
- Does this use DeepSignal for state management?
- Does this follow Preact component patterns (not React)?
- Does this update global state ($s) instead of local component state?
- Is this consistent with ADR-006's migration to WebSocket pattern?

## Architectural Implications

**Core Principles Affected:**
- **Real-time First**: Established - This decision creates the "Real-time First" principle
- **Developer Experience Priority**: Reinforced - Preact's small size and familiar API support fast iteration
- **Package Boundary Discipline**: Reinforced - WebSocket infrastructure in common, applications use it
- **Unified Design System**: Neutral - Frontend choice independent of styling decisions

**System-Wide Impact:**
- **Communication Pattern**: Establishes WebSocket as primary communication method
- **State Management**: DeepSignal becomes standard for reactive state
- **Frontend Architecture**: Preact component model used across all applications
- **Real-time Infrastructure**: WebSocket server/client in common package serves all apps
- **Development Workflow**: Component hot reload with Preact fast refresh

**Coupling Changes:**
- All frontend applications depend on common WebSocket client (good - shared infrastructure)
- Components coupled to global state via $s (acceptable - centralized state management)
- Reduced coupling to backend API details (WebSocket abstracts endpoints)
- UI automatically coupled to data changes (desirable - reactive updates)

**Future Constraints:**
- New features should default to WebSocket (established by this pattern)
- Components should use DeepSignal, not useState (consistency requirement)
- Frontend must maintain WebSocket connection lifecycle
- Server must handle WebSocket at scale (connection pooling, load balancing)
- Enables future: Collaborative editing, live presence, real-time notifications
- Constrains: Must support WebSocket in deployment environment

## Related Decisions

- [ADR-001](./001-monorepo.md): WebSocket infrastructure in common package
- [ADR-003](./003-bun.md): Bun enables fast Preact development workflow
- [ADR-006](./006-ws-migration.md): Validates and extends WebSocket-first approach
- [ADR-012](./012-design-system.md): Preact components use shared design tokens

---

**Pattern**: This decision establishes the Architecture Pattern for real-time frontend communication - prioritizing instant updates and collaboration over simplicity, with careful attention to bundle size and performance.