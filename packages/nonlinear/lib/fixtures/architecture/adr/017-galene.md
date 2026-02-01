# ADR-017: Direct Galene Connection Revival for Video Conferencing

---
**Metadata:**
- **ID**: ADR-017
- **Status**: Proposed
- **Date**: 2025-01-27
- **Tags**: [backend, frontend, infrastructure, architecture, pyrite]
- **Impact Areas**: [pyrite]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-004, ADR-006, ADR-016]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

### Problem Statement

Pyrite's video conferencing functionality was disabled during the migration from the old Pyrite repository/stack to the new Garage44 monorepo structure. During the migration, the Galene WebSocket connection was temporarily mocked to prevent breakage while the new architecture was established. The current state has:

1. **Disabled WebSocket Connection**: Galene WebSocket connection is mocked (lines 162-166 in `sfu.ts`), preventing actual video conferencing
2. **Missing Protocol Version**: Handshake message lacks required `version` field, causing potential protocol incompatibility
3. **Architecture Migration**: Codebase moved to new monorepo structure with different routing, state management, and API patterns
4. **Channel Structure**: New architecture needs channels with `id` (auto-increment), `name` (human-friendly title), and `slug` (unique identifier for routing that matches Galene group name - 1:1 mapping)
5. **Feature Distribution Uncertainty**: Unclear which features (chat, file transfer) should be handled by Galene vs Pyrite

### Historical Context: Old Pyrite Implementation

**Original Implementation** (from `/home/deck/code/pyrite/src/models/sfu/sfu.ts`):
- Connected directly to `ws://location.host/ws` (same origin assumption)
- Simple direct connection: `let url = \`ws\${location.protocol === 'https:' ? 's' : ''}://\${location.host}/ws\``
- Used route parameter `groupId` from `app.router.currentRoute.value.params.groupId`
- All handlers enabled: chat, file transfer, media
- Worked with Nginx proxy forwarding `/ws` to Galene backend
- No status fetching - direct connection assumption

**Migration Impact:**
- Routing changed from group-based to channel-based (`/channels/:channelSlug` vs `/groups/:groupId`)
- Routing uses slugs instead of numeric IDs for better URLs
- State management migrated to DeepSignal (from previous system)
- API structure changed (new channel-based endpoints using slugs)
- Group terminology replaced with channel terminology in UI
- Channel structure needs `slug` field addition (currently may only have `id` and `name`)
- Connection logic temporarily disabled during migration

### Current State Analysis

**Connection Status:**
- Mock connection bypasses actual WebSocket to Galene
- Protocol implementation exists but is outdated (missing version field)
- Group/user sync infrastructure exists (`syncUsersToGalene()`)
- Video UI components exist (VideoStrip, PanelContextVideo)
- Channel slugs directly match Galene group names (1:1 mapping)

**Architecture Status:**
- Galene server is running and accessible
- Pyrite has chat system operating separately
- Channel structure needs `slug` field addition (currently may only have `id` and `name`)
- Channel slugs directly match Galene group names (1:1 mapping)
- New API endpoints use channel slug naming (`/api/channels/:channelSlug/...`)
- Routing should use slugs instead of numeric IDs (`/channels/:channelSlug`)
- Direct connection capability exists but needs revival

### Business Drivers

- **Feature Revival**: Restore video conferencing functionality
- **Real-time First**: Direct WebSocket connection aligns with ADR-004's real-time architecture
- **RTP Requirements**: WebRTC requires direct connection, not proxied (ICE candidate exchange)
- **Feature Separation**: Maintain clear boundaries between Galene (media) and Pyrite (chat)
- **Paradigm Alignment**: Support chat-first paradigm with optional video presence (ADR-016)

### Constraints

- Must maintain direct WebSocket connection to Galene (required for RTP/ICE candidate exchange)
- Must follow Galene protocol specification (https://galene.org/galene-protocol.html)
- Must adapt to new channel-based routing (channels use slugs in routes: `/channels/:channelSlug`)
- Must add `slug` field to channel structure (id, name, slug)
- Must respect channel slug naming convention (`/api/channels/:channelSlug/...`) where channelSlug directly matches Galene group name
- Must maintain Pyrite's chat system separately from Galene (chat-first paradigm per ADR-016)
- Must sync groups/users between Pyrite and Galene
- Must follow existing ADRs (ADR-004: WebSocket, ADR-006: Real-time updates, ADR-016: Layout)
- Must handle endpoint discovery (old implementation assumed same origin, new architecture supports remote Galene servers)

## Decision

### 1. Restore Direct WebSocket Connection to Galene

**Connection Pattern:**
1. Frontend gets channel slug from route (`/channels/:channelSlug`) or state (`$s.chat.activeChannelSlug`)
2. Frontend looks up channel in `$s.channels` to get channel `slug` field
3. Frontend connects to Pyrite WebSocket proxy: `ws://location.host/sfu` (or `wss://` for HTTPS)
4. Pyrite proxy forwards WebSocket connection to Galene backend
5. Connection appears same-origin (proxy handles origin restrictions)
6. Frontend joins group using `channel.slug` (channel slug directly matches Galene group name)
7. No need for endpoint lookup - proxy handles routing to Galene

**Protocol Updates:**
- Add `version: ["2"]` field to handshake message (critical fix - old implementation may have worked without it, but protocol spec requires it)
- Update protocol implementation to match latest Galene spec
- Ensure handshake includes version array per protocol specification

**Channel Structure:**
- Channels have three identifiers:
  - `id`: Auto-incremental numeric ID (internal database key)
  - `name`: Human-friendly title (display name for UI)
  - `slug`: Unique string identifier (used in routes and matches Galene group name)
- Channel slugs are unique and match Galene group names directly (1:1 mapping)
- When connecting: use `channel.slug` for both API endpoint lookup and Galene group name

### 2. Limit Galene Scope to Media + File Transfer

**Feature Distribution:**
- **Galene Handles**: WebSocket connection, group joining, media negotiation (offer/answer/ICE), stream requests, user presence, mute notifications, **file transfer (peer-to-peer via WebRTC datachannels)**
- **Pyrite Handles**: Chat messages, user management, channel/group management, SFU status API

**Rationale:**
- Chat remains in Pyrite to maintain control over messaging features
- File transfer via WebRTC datachannels is efficient (peer-to-peer) and appropriate for Galene
- Media negotiation requires direct connection for RTP candidate exchange
- This separation ensures clean boundaries while leveraging appropriate technologies

### 3. Channel-to-Group Mapping

**Naming Convention:**
- Pyrite uses "channels" terminology with three-part structure: `id` (internal), `name` (display), `slug` (routing/API)
- Galene uses "groups" terminology (string names)
- Channels have three identifiers:
  - `id`: Auto-incremental numeric ID (internal database key, not used in routes)
  - `name`: Human-friendly title (display name for UI)
  - `slug`: Unique string identifier (used in routes: `/channels/:channelSlug` and API endpoints)
- Channel slugs are unique and directly match Galene group names (1:1 mapping)
- API endpoints use channel slug naming: `/api/channels/:channelSlug/sfu_status`
- Routing uses slugs: `/channels/:channelSlug` instead of `/channels/:channelId`
- Backend looks up channel by slug, then proxies to Galene using channel slug directly as the group name

### 4. WebSocket Proxy Connection

**Connection URL Resolution:**
- Connect through Pyrite proxy: `ws://location.host/sfu` (or `wss://` for HTTPS)
- Proxy forwards connection to Galene backend using `config.sfu.url`
- No endpoint lookup needed - proxy handles routing
- Connection appears same-origin (proxy solves origin restrictions)
- Flexible deployment: Galene can be on separate server (proxy handles routing)

### 5. WebSocket Proxy Solution

**Proxy Benefits:**
- Solves origin restrictions: connections appear same-origin to browser
- Simplifies connection: no endpoint lookup needed
- Centralized routing: proxy handles forwarding to Galene
- Flexible deployment: Galene can be on separate server

**Proxy Implementation:**
- Use existing proxy in `middleware.ts` (lines 65-92) at `/sfu` endpoint
- Proxy forwards WebSocket connections to Galene backend
- Connection URL: `ws://location.host/sfu` (or `wss://` for HTTPS)
- Proxy uses `config.sfu.url` to determine Galene backend location

**RTP Considerations:**
- Proxy forwards WebSocket messages bidirectionally
- RTP/ICE candidate exchange should work through proxy (WebSocket is just transport)
- If RTP issues occur, may need to verify proxy message forwarding

## Consequences

### Positive

- **Origin Handling**: Proxy solves origin restrictions automatically (connections appear same-origin)
- **Simplified Connection**: No endpoint lookup needed - connect through proxy
- **Real-time Architecture**: Aligns with ADR-004's WebSocket-first approach
- **Centralized Routing**: Proxy handles connection routing to Galene
- **Feature Separation**: Clear boundaries between Galene (media) and Pyrite (chat)
- **Protocol Compliance**: Updated handshake ensures compatibility with Galene protocol
- **Efficient File Transfer**: WebRTC datachannels provide peer-to-peer file transfer without server bandwidth
- **Paradigm Alignment**: Supports chat-first paradigm with optional video presence (ADR-016)

### Negative

- **Proxy Dependency**: Frontend depends on Pyrite proxy for WebSocket connections
- **Implementation Complexity**: Requires protocol updates and proxy configuration
- **Connection Management**: Must handle WebSocket connections through proxy, reconnections, errors
- **Protocol Maintenance**: Must keep protocol implementation aligned with Galene spec updates
- **RTP Verification**: Need to verify RTP/ICE candidate exchange works properly through proxy

## Decision Pattern

**When to Apply This Pattern:**
- Integrating external real-time systems (video, audio, collaboration)
- WebRTC requires direct connection for media negotiation
- Need to separate feature domains while maintaining integration
- Real-time features require low-latency connections
- External system provides specialized functionality (media handling)

**When NOT to Apply:**
- Simple request/response APIs (use REST)
- Features that don't require real-time communication
- Systems that don't support direct WebSocket connections
- When proxy is sufficient (non-RTP use cases)

**Key Questions to Ask:**
1. Does this feature require WebRTC or similar peer-to-peer technology?
2. Does the external system require direct connection for optimal performance?
3. Which features should remain in our system vs. delegated to external system?
4. What are the protocol requirements and how do we ensure compliance?
5. Are there origin restrictions for WebSocket connections, and how are they handled?
6. Can the external system accept connections from our origin, or do we need same-domain deployment?

**Decision Criteria:**
- RTP Compatibility: 10/10 (critical - WebRTC requires direct connection)
- Real-time Architecture Alignment: 9/10 (aligns with ADR-004 WebSocket-first)
- Feature Separation Clarity: 9/10 (clear boundaries improve maintainability)
- Implementation Complexity: 7/10 (requires protocol updates and connection management)
- Protocol Compliance: 9/10 (must match Galene spec for compatibility)

**Success Metrics:**
- WebSocket connection success rate: >95%
- RTP candidate exchange: Successful peer connection establishment
- Protocol compatibility: No handshake failures
- Feature separation: Chat works independently, media works through Galene

## Rationale Chain

**Primary Reasoning:**
1. Video conferencing functionality was disabled during migration and needs revival
2. Old implementation connected directly to same host (`ws://location.host/ws`) - simple but inflexible
3. Proxy solves origin restrictions (making connections appear same-origin)
4. Proxy simplifies connection (no endpoint lookup needed)
5. Proxy enables flexible deployment (Galene can be on separate server)
6. WebSocket proxy forwards messages bidirectionally (RTP should work through proxy)
7. Limiting Galene to media + file transfer maintains clear feature boundaries
8. Chat remains in Pyrite to maintain control over messaging features (chat-first paradigm)
9. Protocol compliance (version field) ensures compatibility with current and future Galene versions
10. Channel slugs directly match Galene group names (1:1 mapping, no separate mapping field needed)

**Alternatives Considered:**

### Alternative 1: Restore Old Implementation (Same-Origin Connection)
- **Pros**: Simple, already worked, minimal changes needed, avoids origin restrictions
- **Cons**: Assumes Galene on same host, inflexible deployment, doesn't support remote Galene servers
- **Rejected Because**: New architecture should support flexible deployment scenarios (same host or separate server)

### Alternative 2: Direct Connection to Galene
- **Pros**: Simpler connection flow, no proxy dependency
- **Cons**: Requires handling origin restrictions, endpoint lookup complexity
- **Rejected Because**: Proxy solves origin restrictions automatically and simplifies connection

### Alternative 3: Same-Domain Deployment
- **Pros**: Avoids origin restrictions entirely, simple configuration
- **Cons**: Requires specific deployment setup, less flexible
- **Rejected Because**: Proxy provides flexibility without deployment constraints

### Alternative 4: Handle Everything in Pyrite
- **Pros**: Full control over all features, no external dependencies, consistent architecture
- **Cons**: Significant development effort, reinventing mature media handling, lower quality, slower time-to-market
- **Rejected Because**: Galene provides mature, tested media handling infrastructure that we should leverage

### Alternative 5: Handle Everything in Galene
- **Pros**: Single system, simpler architecture, no integration complexity
- **Cons**: Loses control over chat features, ties to Galene's chat limitations, contradicts chat-first paradigm (ADR-016)
- **Rejected Because**: Pyrite's chat-first paradigm requires control over messaging features, Galene's chat doesn't meet requirements

**Trade-off Analysis:**
- We accepted proxy dependency to solve origin restrictions automatically vs. handling origin configuration manually
- We simplified connection (no endpoint lookup) vs. status fetching complexity
- We prioritized media functionality through Galene over full Pyrite implementation (leverage existing infrastructure)
- We maintained chat in Pyrite to preserve control over messaging features (chat-first paradigm)
- We kept file transfer in Galene because WebRTC datachannels are efficient for peer-to-peer transfer (peer-to-peer benefits)
- We use direct channel slug to group name mapping (1:1) - simple and straightforward, with human-friendly names for display

**Assumptions:**
- Galene server is accessible from Pyrite backend (network configured)
- Proxy properly forwards WebSocket messages bidirectionally (RTP works through proxy)
- Channel slugs are unique and match Galene group names directly (1:1 mapping)
- Channel slugs are suitable for both routing/URLs and Galene group names
- Channel `slug` field will be added to channel structure (migration needed)
- Protocol version 2 is sufficient (Galene supports version negotiation)
- File transfer via WebRTC datachannels meets requirements (peer-to-peer efficiency)
- Chat system in Pyrite is sufficient without Galene's chat functionality

## Code Context

**Files to Modify:**
- `/packages/pyrite/lib/channel-manager.ts` - Add `slug` field to Channel interface and database schema
- `/packages/pyrite/src/components/conference/app.tsx` - Update routing to use slugs (`/channels/:channelSlug`), add video strip toggle functionality
- `/packages/pyrite/src/components/conference/channel/channel.tsx` - Update to use channel slug instead of ID
- `/packages/pyrite/src/models/sfu/protocol.ts` - Add `version: ["2"]` to handshake (line 290-293)
- `/packages/pyrite/src/models/sfu/sfu.ts` - Remove mock connection, re-enable WebSocket connection through proxy, disable chat handlers, keep file transfer handler
- `/packages/pyrite/lib/middleware.ts` - Keep and use WebSocket proxy at `/sfu` endpoint (lines 65-92)

**Implementation Pattern:**
```typescript
// ✅ Proxy connection pattern
async function connect(username, password) {
  // 1. Get channel from state or route (using slug)
  const channelSlug = $s.chat.activeChannelSlug // or from route params
  const channel = $s.channels.find(c => c.slug === channelSlug)
  if (!channel) throw new Error('Channel not found')

  // 2. Connect through Pyrite proxy (solves origin restrictions)
  // No endpoint lookup needed - proxy handles routing to Galene
  const proxyUrl = `ws${location.protocol === 'https:' ? 's' : ''}://${location.host}/sfu`
  await connection.connect(proxyUrl)

  // 3. Join group (uses channel.slug - it directly matches Galene group name)
  connection.join(channel.slug, username, password)
}

// ✅ Protocol handshake (CRITICAL FIX)
sc.send({
  type: 'handshake',
  version: ["2"],  // REQUIRED - array of supported versions
  id: sc.id,
})

// ✅ Handler setup (chat disabled, file transfer enabled)
connection.onchat = null  // Pyrite handles chat
connection.onfiletransfer = onFileTransfer  // Galene handles file transfer
```

**Anti-patterns to Avoid:**
```typescript
// ❌ Don't use proxy for WebRTC connections
const proxiedWs = new WebSocket('/sfu/proxy')  // Blocks RTP messaging

// ❌ Don't omit version field in handshake
sc.send({ type: 'handshake', id: sc.id })  // Missing version causes protocol mismatch

// ❌ Don't try to handle chat through Galene
connection.onchat = app.$m.chat.onMessage  // Chat should stay in Pyrite

// ✅ Do connect directly to Galene
const endpoint = status.endpoint
await connection.connect(endpoint)

// ✅ Do include version in handshake
sc.send({ type: 'handshake', version: ["2"], id: sc.id })

// ✅ Do disable chat handler, keep file transfer
connection.onchat = null  // Chat in Pyrite
connection.onfiletransfer = onFileTransfer  // File transfer in Galene
```

**Migration Path:**
1. Add `slug` field to Channel interface and database schema:
   - Add `slug` column to channels table (unique, indexed)
   - Generate slugs from existing channel names (or migrate existing data)
   - Update Channel interface to include `slug` field
2. Update routing to use slugs:
   - Change routes from `/channels/:channelId` to `/channels/:channelSlug`
   - Update route handlers to look up channels by slug instead of ID
   - Update state management to use `activeChannelSlug` instead of `activeChannelId`
3. Fix protocol handshake to include `version: ["2"]` field (line 290-293 in protocol.ts)
4. Update `connect()` function to:
   - Get channel from state/route using slug
   - Connect through Pyrite proxy: `ws://location.host/sfu` (or `wss://` for HTTPS)
   - No endpoint lookup needed - proxy handles routing
   - Join group using `channel.slug` (channel slug directly matches Galene group name)
5. Remove mock connection (lines 162-166), re-enable WebSocket connection through proxy
6. Disable chat handlers (`onchat`, `onclearchat`), keep file transfer handler
7. Verify proxy in `middleware.ts` is properly configured at `/sfu` endpoint
8. Test connection establishment, RTP messaging, file transfer through proxy
9. Verify chat continues working independently in Pyrite
10. Verify channel slug to group name mapping works correctly (1:1 direct mapping)

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Does this decision align with ADR-004's WebSocket-first architecture for real-time features?"
2. "How does this compare to ADR-006's REST-to-WebSocket migration pattern?"
3. "What are the RTP/WebRTC requirements and do they necessitate direct connections?"
4. "Does this introduce appropriate feature boundaries between systems?"

**Pattern Recognition Cues:**
- If you see WebRTC/media negotiation requirements, consider direct connection pattern
- If external system requires real-time bidirectional communication, consider WebSocket integration
- If features have different requirements (media vs messaging), consider feature separation
- If protocol compliance is critical, ensure handshake/negotiation follows specification

**Red Flags:**
- ⚠️ Using proxy for WebRTC connections (blocks ICE candidate exchange)
- ⚠️ Missing protocol version fields (causes compatibility issues)
- ⚠️ Mixing feature domains unnecessarily (violates separation of concerns)
- ⚠️ Ignoring protocol specifications (leads to breaking changes)
- ⚠️ Not handling origin restrictions for WebSocket connections (causes connection failures)
- ⚠️ Assuming WebSocket CORS works like HTTP CORS (different mechanisms)

**Consistency Checks:**
- Does this align with ADR-004's WebSocket-first real-time architecture?
- Does this follow ADR-006's pattern for real-time feature migration?
- Does this respect ADR-016's chat-first paradigm with optional video?
- Are feature boundaries clear and maintainable?

## Architectural Implications

**Core Principles Affected:**
- **Real-time First** (ADR-004): Reinforced - Direct WebSocket connection enables real-time media
- **Feature Separation**: Reinforced - Clear boundaries between Galene (media) and Pyrite (chat)
- **Protocol Compliance**: New - Must maintain alignment with external protocol specifications
- **Connection Architecture**: Modified - Direct connections required for WebRTC, proxy not suitable

**System-Wide Impact:**
- **Connection Management**: Direct WebSocket connections to Galene (bypass proxy)
- **API Structure**: New endpoint `/api/channels/:channelName/sfu_status` for status proxying
- **Feature Distribution**: Galene handles media + file transfer, Pyrite handles chat
- **Protocol Implementation**: Must track and update to match Galene specification

**Coupling Changes:**
- Frontend now depends on both Pyrite API (chat, status) and Galene WebSocket (media)
- Backend proxies status requests but clients connect directly to Galene
- Reduced coupling: Chat system independent from media system
- Channel slugs directly match Galene group names (1:1 naming convention coupling)

**Future Constraints:**
- Protocol updates must track Galene specification changes
- Direct connection requirement constrains proxy-based solutions for RTP
- Feature separation must be maintained (chat in Pyrite, media in Galene)
- Channel slugs must remain unique and directly match Galene group names (1:1 mapping)

## Related Decisions

- [ADR-004](./004-preact-ws.md): WebSocket-first architecture enables real-time media connections
- [ADR-006](./006-ws-migration.md): REST-to-WebSocket migration pattern for real-time features
- [ADR-016](./016-layout.md): Chat-first paradigm with optional video presence aligns with feature distribution

## References

- Galene Protocol Documentation: https://galene.org/galene-protocol.html
- Galene Client Documentation: https://github.com/jech/galene/blob/master/galene-client.md
- Galene Protocol Reference: https://github.com/jech/galene/blob/master/static/protocol.js
- WebRTC ICE Candidate Exchange: https://webrtc.org/getting-started/peer-connections-and-ice
- Old Pyrite Implementation: `/home/deck/code/pyrite/src/models/sfu/sfu.ts` (reference for migration context)
