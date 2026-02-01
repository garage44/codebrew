# ADR-007: Migration from Express and Ws to Bun.serve and Bun WebSockets

---
**Metadata:**
- **ID**: ADR-007
- **Status**: Accepted
- **Date**: 2025-06-02
- **Tags**: [backend, infrastructure, migration, performance, tooling]
- **Impact Areas**: [expressio, pyrite, common, bunchy]
- **Decision Type**: tool_adoption
- **Related Decisions**: [ADR-003, ADR-006]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

Expressio currently uses Express.js as its HTTP server framework and the `ws` library for WebSocket functionality. The project runs on Bun runtime, which provides native HTTP server capabilities through `Bun.serve()` and built-in WebSocket support. **Critical constraint**: The `ws` library has a bug in Bun's newer runtimes, forcing Expressio to remain on an older version of Bun and preventing access to newer Bun features, performance improvements, and security updates.

This ADR evaluates the benefits and trade-offs of migrating from the current Express + Ws stack to Bun's native server capabilities, with particular emphasis on resolving the Bun runtime compatibility issue.

## Current Architecture

### Express + Ws Implementation

The current implementation uses:
- **Express.js** (v5) for HTTP server and middleware
- **ws** library (v8.18.1) for WebSocket server
- **express-session** for session management
- **express-winston** for logging middleware
- **cookie-parser** for cookie handling
- **path-to-regexp** for route matching

Key components:
- `packages/expressio/service.ts` - Main server setup with Express
- `packages/common/lib/ws-server.ts` - WebSocket server implementation using `ws`
- `packages/common/lib/middleware.ts` - Express middleware setup
- `packages/expressio/lib/ws-server.ts` - Expressio-specific WebSocket integration

### Current Server Setup

```typescript
// Current Express setup
export const app = express()
const server = new Server(app)
const wss = new WebSocketServer({
    path: '/ws',
    server: options.server,
})
server.listen(argv.port, argv.host)
```

### Critical Constraint: Bun Runtime Compatibility

**The `ws` library has a bug in Bun's newer runtimes**, which:
- Forces Expressio to remain on an older version of Bun
- Prevents access to newer Bun features and performance improvements
- Blocks security updates and bug fixes in newer Bun versions
- Creates technical debt and maintenance burden
- Limits the project's ability to leverage Bun's evolving ecosystem

## Proposed Architecture

### Bun.serve + Bun WebSockets

The proposed implementation would use:
- **Bun.serve()** for HTTP server with native performance
- **Bun's built-in WebSocket support** for real-time communication
- **Custom middleware system** compatible with Bun.serve
- **Native session handling** or lightweight session library
- **Bun's built-in logging** or custom logging middleware

## Decision Drivers

### Bun Runtime Compatibility (Critical)

**Pros:**
- **Resolve Runtime Constraint**: Eliminate the `ws` library bug and enable use of latest Bun versions
- **Access to New Features**: Leverage latest Bun performance improvements, security updates, and features
- **Future-Proofing**: Ensure compatibility with ongoing Bun development
- **Ecosystem Alignment**: Better integration with Bun's evolving tooling and ecosystem
- **Security**: Access to latest security patches and updates in Bun runtime

**Cons:**
- **Migration Effort**: Significant refactoring required to replace Express + ws stack
- **Testing Complexity**: Need to validate all functionality with new implementation

### Performance Benefits

**Pros:**
- **Native Performance**: Bun.serve is built on top of uWebSockets.js, providing significantly better performance than Express
- **Reduced Memory Footprint**: Eliminates Express.js overhead and reduces bundle size
- **Faster Startup**: Native Bun server starts faster than Express + Node.js HTTP server
- **Better Concurrency**: Bun's event loop and async handling are more efficient
- **WebSocket Performance**: Native WebSocket implementation avoids the `ws` library overhead

**Cons:**
- **Performance gains may be minimal** for Expressio's current scale (single-user tooling application)
- **Express.js is already well-optimized** for typical web application workloads

### Developer Experience

**Pros:**
- **Simplified Dependencies**: Remove Express.js, ws, and related middleware dependencies
- **Native Integration**: Better integration with Bun's ecosystem and tooling
- **TypeScript Support**: Bun.serve has excellent TypeScript support out of the box
- **Consistent Runtime**: Everything runs natively in Bun without Node.js compatibility layers
- **Modern Development**: Access to latest Bun development tools and features

**Cons:**
- **Learning Curve**: Team needs to learn Bun.serve API and patterns
- **Ecosystem Maturity**: Express.js has a more mature ecosystem and documentation
- **Middleware Compatibility**: Need to rewrite or adapt existing middleware
- **Debugging Tools**: Express.js has better debugging and profiling tools

### Code Complexity

**Pros:**
- **Simplified Architecture**: Single server implementation instead of Express + HTTP server + WebSocket server
- **Reduced Abstraction Layers**: Direct Bun.serve API without Express middleware stack
- **Cleaner WebSocket Integration**: Native WebSocket support without external library
- **Eliminate Compatibility Layer**: Remove Node.js compatibility overhead

**Cons:**
- **Migration Effort**: Significant refactoring required across multiple packages
- **Middleware Rewrite**: Need to reimplement session handling, logging, authentication
- **Route Handling**: Different routing patterns and middleware composition
- **Testing Complexity**: Need to update tests and mocking strategies

### Maintenance and Ecosystem

**Pros:**
- **Fewer Dependencies**: Remove Express.js, ws, express-session, express-winston, cookie-parser
- **Bun Native**: Better alignment with Bun's development roadmap
- **Security**: Fewer third-party dependencies reduce attack surface
- **Bundle Size**: Smaller production bundles
- **Runtime Updates**: Ability to update Bun runtime without compatibility issues

**Cons:**
- **Ecosystem Risk**: Bun.serve is newer and less battle-tested than Express.js
- **Community Support**: Smaller community and fewer resources for troubleshooting
- **Migration Risk**: Potential for introducing bugs during migration
- **Vendor Lock-in**: Increased dependency on Bun's WebSocket implementation

## Implementation Considerations

### Migration Strategy

1. **Incremental Migration**: Start with HTTP routes, then migrate WebSocket functionality
2. **Dual Support**: Maintain Express compatibility during transition period
3. **Feature Parity**: Ensure all current functionality works with new implementation
4. **Testing**: Comprehensive testing of WebSocket real-time features
5. **Bun Version Upgrade**: Plan for upgrading to latest Bun version after migration

### Required Changes

#### Core Server (`packages/expressio/service.ts`)
```typescript
// Proposed Bun.serve setup
const server = Bun.serve({
    port: argv.port,
    hostname: argv.host,
    fetch: handleRequest,
    websocket: handleWebSocket,
})
```

#### WebSocket Server (`packages/common/lib/ws-server.ts`)
```typescript
// Proposed Bun WebSocket implementation
function handleWebSocket(ws: ServerWebSocket) {
    // Native Bun WebSocket handling
    ws.onmessage = async (message) => {
        // Handle WebSocket messages
    }
}
```

#### Middleware System (`packages/common/lib/middleware.ts`)
```typescript
// Proposed Bun.serve middleware
const middleware = compose([
    sessionMiddleware,
    authMiddleware,
    loggingMiddleware,
    // ... other middleware
])
```

### Compatibility Challenges

1. **Session Management**: Express-session compatibility with Bun.serve
2. **Route Matching**: Path-to-regexp patterns in Bun.serve context
3. **WebSocket API**: Differences between `ws` library and Bun WebSocket API
4. **Middleware Composition**: Express middleware patterns vs Bun.serve handlers
5. **Error Handling**: Different error handling patterns and middleware

## Alternatives Considered

### Alternative 1: Keep Current Stack
- **Pros**: Stable, well-tested, mature ecosystem
- **Cons**: **Forced to use older Bun version**, performance overhead, dependency on Node.js compatibility layer, **blocks access to Bun improvements**

### Alternative 2: Hybrid Approach
- **Pros**: Gradual migration, reduced risk
- **Cons**: Increased complexity, maintenance burden, **still requires ws library**

### Alternative 3: Other Bun-Compatible WebSocket Libraries
- **Pros**: Mature WebSocket libraries with Bun support
- **Cons**: Still external dependencies, may have similar compatibility issues, may not provide same performance benefits

### Alternative 4: Wait for ws Library Fix
- **Pros**: Minimal code changes required
- **Cons**: **Uncertain timeline**, **blocks Bun updates indefinitely**, **dependency on third-party fix**

## Recommendation

**Proceed with migration to Bun.serve and Bun WebSockets** with the following rationale:

### Primary Reasons to Migrate

1. **Critical Runtime Constraint**: The `ws` library bug prevents using newer Bun versions, creating a significant technical debt
2. **Bun Ecosystem Access**: Migration enables access to latest Bun features, performance improvements, and security updates
3. **Future-Proofing**: Ensures long-term compatibility with Bun's development roadmap
4. **Performance Benefits**: Native Bun.serve and WebSocket implementation provides better performance
5. **Dependency Reduction**: Eliminates problematic `ws` dependency and reduces overall dependency footprint

### Migration Timeline

- **Single Day Implementation**: Complete migration from Express + ws to Bun.serve + Bun WebSockets
- **Immediate Testing**: Validate all functionality works with new implementation
- **Deployment**: Deploy updated version with latest Bun runtime support

### Risk Mitigation

1. **Focused Scope**: Target single-day implementation with clear feature parity requirements
2. **Comprehensive Testing**: Ensure all current functionality works with new implementation
3. **Rollback Plan**: Maintain ability to revert to Express + ws if critical issues arise
4. **Documentation**: Update code comments and patterns for Bun.serve implementation

## Consequences

### Positive Consequences of Migration
- **Runtime Freedom**: Ability to use latest Bun versions and features
- **Performance**: Improved performance through native Bun implementation
- **Maintenance**: Reduced dependency management and compatibility issues
- **Future-Proofing**: Better alignment with Bun's development roadmap
- **Security**: Access to latest security updates and patches

### Negative Consequences of Migration
- **Development Overhead**: Significant migration effort and learning curve
- **Risk**: Potential for introducing bugs during migration
- **Temporary Instability**: Period of adjustment to new patterns and APIs
- **Resource Allocation**: Migration effort diverts resources from feature development

### Consequences of Not Migrating
- **Runtime Lock-in**: Forced to remain on older Bun version indefinitely
- **Technical Debt**: Accumulating compatibility issues and maintenance burden
- **Feature Limitations**: Inability to leverage latest Bun improvements
- **Security Risk**: Missing security updates and patches in newer Bun versions

## Implementation Lessons Learned

### Migration Execution Summary

The migration from Express + ws to Bun.serve + Bun WebSockets was successfully completed in a single development session. The implementation validated the original assessment while revealing several important technical insights.

### Key Technical Challenges Encountered

#### 1. WebSocket Upgrade Handling
**Challenge**: Bun.serve's WebSocket upgrade mechanism differs significantly from Express + ws patterns.

**Solution**:
- Bun.serve requires the `fetch` handler to return `undefined` (not a Response) for WebSocket upgrade requests
- Must call `server.upgrade(request)` and return `undefined` on success
- The `websocket` option must be a function, not an object with event handlers

```typescript
// Correct Bun.serve WebSocket upgrade pattern
if (url.pathname === '/ws') {
    const success = server.upgrade(request, { data: { endpoint: '/ws' } });
    if (success) return; // Return undefined, not a Response
    return new Response("WebSocket upgrade failed", { status: 400 });
}
```

#### 2. Session Management Complexity
**Challenge**: Express-session and cookie-parser dependencies needed complete replacement.

**Solution**:
- Implemented custom session store using `Map()` for in-memory sessions
- Built cookie parsing and setting utilities compatible with Bun.serve
- Integrated session middleware into the main request handler flow
- Added session context to all API handlers

```typescript
// Custom session middleware for Bun.serve
const sessionMiddleware = (request: Request) => {
    const cookies = parseCookies(request)
    const sessionId = cookies['expressio-session']

    if (!sessionId || !sessions.has(sessionId)) {
        const newSessionId = crypto.randomUUID()
        const session = { userid: null }
        sessions.set(newSessionId, session)
        return { session, sessionId: newSessionId }
    }

    return { session: sessions.get(sessionId), sessionId }
}
```

#### 3. Dual WebSocket Endpoint Architecture
**Challenge**: Expressio uses two separate WebSocket endpoints (`/ws` and `/bunchy`) with different purposes.

**Solution**:
- Implemented separate `WebSocketServerManager` instances for each endpoint
- Used `server.upgrade(request, { data: { endpoint: '/ws' } })` to pass endpoint context
- Created `apiWs` and `apiBunchy` wrapper objects for route registration
- Maintained clean separation between main app and development tooling APIs

#### 4. API Response Serialization
**Challenge**: Bun.serve's direct JSON serialization exposed circular references in workspace objects.

**Solution**:
- Implemented selective field serialization in API responses
- Used `JSON.parse(JSON.stringify(obj))` for deep cloning of complex objects
- Avoided returning raw workspace instances with circular references
- Updated directory-browser API to return only serializable fields

#### 5. Router Pattern Adaptation
**Challenge**: Express-style routing patterns needed adaptation for Bun.serve's fetch handler.

**Solution**:
- Built custom Router class that mimics Express patterns
- Implemented path parameter extraction using regex matching
- Added session context to all route handlers
- Maintained familiar API registration patterns for existing code

### Performance and Stability Observations

#### Positive Outcomes
- **WebSocket Performance**: Native Bun WebSocket implementation shows improved connection stability
- **Memory Usage**: Reduced memory footprint by eliminating Express.js overhead
- **Startup Time**: Faster server startup with native Bun.serve
- **TypeScript Integration**: Excellent TypeScript support throughout the migration

#### Areas Requiring Attention
- **Session Persistence**: In-memory session store requires consideration for production scaling
- **Error Handling**: Bun.serve error patterns differ from Express middleware
- **Development Tooling**: Some debugging tools may need adaptation for Bun.serve

### Migration Validation

#### Successfully Migrated Components
- ✅ HTTP server with Bun.serve
- ✅ WebSocket server with dual endpoints (`/ws`, `/bunchy`)
- ✅ Session management and authentication
- ✅ Static file serving
- ✅ SPA fallback routing
- ✅ All existing API endpoints
- ✅ Directory browser functionality
- ✅ Real-time translation features

#### Maintained Functionality
- ✅ WebSocket API routing and message handling
- ✅ Session persistence across page reloads
- ✅ Authentication flow (login/logout)
- ✅ Development mode with hot reloading
- ✅ All existing frontend features

### Recommendations for Future Migrations

1. **WebSocket Upgrades**: Always return `undefined` from fetch handler for WebSocket upgrades
2. **Session Management**: Plan for custom session implementation when migrating from Express-session
3. **API Serialization**: Implement selective serialization to avoid circular reference issues
4. **Dual Endpoints**: Use endpoint context in upgrade data for multiple WebSocket paths
5. **Testing Strategy**: Test WebSocket connections early in migration process
6. **Error Handling**: Adapt error handling patterns for Bun.serve's different error model

### Migration Timeline Reality

**Actual Implementation Time**: ~6 hours (single development session)
- **Core Migration**: 4 hours
- **Session Management**: 1 hour
- **Testing and Debugging**: 1 hour

The migration was completed faster than initially estimated, validating the "single day implementation" timeline proposed in the original ADR.

## Decision Pattern

**Pattern Name**: Migration Pattern (Framework/Tool Replacement for Runtime Compatibility)

**When to Apply This Pattern:**
- Current framework incompatible with chosen runtime
- Runtime provides native capabilities that obviate framework need
- Technical debt from compatibility workarounds
- Performance improvements available from native implementation
- Framework adds unnecessary complexity for use case

**When NOT to Apply:**
- Framework still provides significant value beyond runtime capabilities
- Team lacks expertise with native APIs
- Migration risk outweighs compatibility benefits
- Production stability is critical with zero tolerance for issues

**Key Questions to Ask:**
1. Does the runtime provide native capabilities matching framework features?
2. What's the blocker preventing upgrade to newer runtime versions?
3. Can we maintain feature parity with native implementation?
4. What's the migration effort vs. ongoing compatibility cost?
5. Are there hidden dependencies on framework behaviors?
6. How do we validate feature parity during migration?

**Decision Criteria:**
- **Runtime Compatibility**: 10/10 - Critical blocker preventing Bun upgrades
- **Performance**: 8/10 - Native implementation faster
- **Simplicity**: 9/10 - Reduces dependencies and complexity
- **Migration Risk**: 6/10 - Manageable with careful testing
- **Feature Parity**: 9/10 - Bun.serve covers Express use case
- **Team Knowledge**: 7/10 - Learning curve for Bun-specific APIs

**Success Metrics:**
- Runtime upgrade unblocked: Can use latest Bun version
- Performance improvement: Measurable latency reduction
- Dependency reduction: Fewer npm packages
- Feature parity: 100% of existing functionality working
- Zero regressions: No functionality lost in migration

## Rationale Chain

**Primary Reasoning:**
1. `ws` library has bug in newer Bun runtimes
2. Bug forces us to stay on old Bun version
3. Old Bun version blocks access to improvements and security updates
4. Bun provides native WebSocket support eliminating need for `ws`
5. If removing `ws`, might as well evaluate Express necessity
6. Bun.serve is faster and simpler than Express for our use case
7. Migration removes compatibility blocker and simplifies stack

**Technical Debt Reasoning:**
- **Compatibility workarounds** accumulate over time
- **Staying on old versions** creates compounding problems
- **Native runtime features** are typically better maintained
- **Simplification** reduces future maintenance burden

**Alternative Approaches Rejected:**
- **Keep Express + ws**: Doesn't solve runtime compatibility issue
- **Fix ws library**: Outside our control, not maintainable
- **Fork ws library**: Maintenance burden too high
- **Use different WebSocket library**: Still adds dependency, Bun native better

**Trade-off Analysis:**
- **Accepted Effort**: One-time migration (~6 hours actual)
- **Gained Benefit**: Unblocked runtime upgrades, better performance, simpler stack
- **Reasoning**: Short-term migration pain for long-term maintainability
- **Mitigation**: Thorough testing, incremental rollout, feature parity validation

**Assumptions:**
- Bun.serve stable enough for production (validated: works well)
- Native WebSocket as capable as ws library (validated: feature-complete)
- Migration can be completed in reasonable time (validated: 6 hours)
- No hidden Express.js dependencies (validated: custom middleware works)

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Is the current framework incompatible with our runtime choice?"
2. "Does the runtime provide native capabilities that eliminate framework need?"
3. "What's the cost of maintaining compatibility workarounds?"
4. "How does this align with ADR-003's Bun adoption and simplification goals?"
5. "Can we validate feature parity before committing to migration?"

**Pattern Recognition Cues:**
- If forced to stay on old runtime version due to dependency, investigate native alternatives
- If adding workarounds for runtime compatibility, consider migration
- If framework usage is minimal, runtime native features might suffice
- If performance is concern, native implementations often faster

**Red Flags:**
- ⚠️ Migrating without validating feature parity first
- ⚠️ Not testing all WebSocket functionality after migration
- ⚠️ Assuming Express patterns work identically in Bun.serve
- ⚠️ Skipping session management planning
- ⚠️ Not documenting migration learnings for future reference

**Consistency Checks:**
- Does this use Bun runtime features (ADR-003)?
- Does this simplify toolchain (ADR-003 principle)?
- Does this maintain WebSocket functionality (ADR-004, ADR-006)?
- Are we following incremental migration pattern?
- Have we maintained all existing features?

## Architectural Implications

**Core Principles Affected:**
- **Developer Experience Priority**: Reinforced - Simpler stack, faster iteration
- **Real-time First**: Maintained - WebSocket functionality preserved and improved
- **Package Boundary Discipline**: Simplified - Fewer cross-package dependencies

**System-Wide Impact:**
- **Runtime Stack**: Fully native Bun (serve + WebSocket + bundler)
- **Dependency Count**: Reduced by 5 packages (Express, ws, related middleware)
- **Performance**: Improved request/response and WebSocket performance
- **Build System**: Simplified (no Express-specific concerns)
- **Maintenance**: Reduced surface area for compatibility issues

**Coupling Changes:**
- Removed coupling to Express.js middleware system
- Removed coupling to ws library APIs
- Increased coupling to Bun-specific APIs (acceptable - already on Bun)
- Simplified coupling model overall (fewer layers)

**Future Constraints:**
- Must use Bun-compatible patterns (not Express patterns)
- Middleware must be Bun.serve compatible
- WebSocket handling uses Bun's API conventions
- Enables: Full access to latest Bun features and improvements
- Enables: Simpler architecture with fewer dependencies
- Constrains: Bun.serve-specific deployment requirements

## References

- [Bun.serve Documentation](https://bun.sh/docs/api/http)
- [Bun WebSocket API](https://bun.sh/docs/api/websockets)
- [Express.js Performance](https://expressjs.com/en/advanced/best-practices-performance.html)
- [ws Library Documentation](https://github.com/websockets/ws)
- [ADR-003: Bun Runtime Adoption](./003-bun.md)
- [ADR-006: REST to WebSocket Migration](./006-ws-migration.md)

---

**Pattern**: This decision exemplifies the Migration Pattern for framework/tool replacement - driven by runtime compatibility needs, validating that native runtime features can replace external frameworks while simplifying the stack and improving performance. Demonstrates incremental migration with feature parity validation.