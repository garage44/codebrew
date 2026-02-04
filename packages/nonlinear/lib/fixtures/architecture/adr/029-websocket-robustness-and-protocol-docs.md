# ADR-029: WebSocket Robustness Improvements and Protocol Documentation

---
**Metadata:**
- **ID**: ADR-029
- **Status**: Proposed
- **Date**: 2025-02-04
- **Tags**: [architecture, websocket, robustness, testing, documentation]
- **Impact Areas**: [common, nonlinear]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-004, ADR-006, ADR-028]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

The Garage44 workspace uses a custom WebSocket protocol (ADR-004, ADR-006) built on Bun's native WebSocket support. The protocol provides URL-based routing, request/response patterns, and pub/sub subscriptions. However, analysis of the current implementation revealed several robustness issues that could cause crashes or poor error handling.

**Current Issues Identified:**

1. **Broadcast Error Handling**: `broadcast()` and `emitEvent()` methods can crash if a connection is dead/closing when `ws.send()` throws. Dead connections accumulate in the connections Set.

2. **Message Handler Error Responses**: When message parsing fails or routes don't match, errors are logged but no error response is sent to the client. Handler errors can cause crashes if `ws.send()` fails in the error handler.

3. **Client Message Validation**: Client doesn't validate message structure before accessing fields, causing crashes on malformed messages.

4. **Dead Connection Cleanup**: Connections with `readyState !== 1` remain in the Set indefinitely, causing memory leaks.

5. **Lack of Protocol Documentation**: No comprehensive documentation of the WebSocket protocol for agents or developers. Tests are missing, so protocol behavior is not verified.

**Requirements:**

- Fix critical error handling issues without breaking existing functionality
- Add comprehensive test suite that serves as executable documentation
- Create protocol guide in architecture fixtures for agent consumption
- Maintain backward compatibility
- Preserve URL-based routing architecture (user requirement)

**Alternatives Considered:**

1. **Rewrite WebSocket System**: Complete rewrite with new architecture
   - ❌ Breaks existing code
   - ❌ Loses URL-based routing (user requirement)
   - ❌ High risk, high effort

2. **Add Features Without Fixes**: Add heartbeat, rate limiting, etc. without fixing existing issues
   - ❌ Doesn't address current problems
   - ❌ Adds complexity without fixing foundation

3. **Incremental Fixes**: Fix specific weak spots, add tests, document protocol
   - ✅ Addresses actual problems
   - ✅ Maintains backward compatibility
   - ✅ Preserves existing architecture
   - ✅ Low risk, focused effort

## Decision

Implement **incremental robustness improvements** to the existing WebSocket system:

### 1. **Fix Critical Error Handling**

**Broadcast/emitEvent Error Handling:**
- Wrap each `ws.send()` call in try-catch
- Remove dead connections from Set during broadcast
- Prevent single connection failure from crashing entire broadcast

**Message Handler Error Responses:**
- Send error responses for all failure cases (invalid JSON, missing fields, handler errors, no route matched)
- Wrap all `ws.send()` calls in try-catch
- Ensure clients always receive error responses for failed requests

**Client Message Validation:**
- Validate message structure before accessing fields
- Emit error events for malformed messages
- Handle JSON parse failures gracefully

**Dead Connection Cleanup:**
- Add cleanup method to remove dead connections
- Call cleanup during broadcasts and connection close
- Prevent memory leaks from accumulated dead connections

### 2. **Comprehensive Test Suite**

Create test suite that serves as **executable documentation**:

**Test Structure:**
- `ws-server.test.ts` - Server error handling and robustness tests
- `ws-client.test.ts` - Client error handling and validation tests
- `ws-integration.test.ts` - End-to-end protocol tests
- Test helpers for server and client setup

**Test Philosophy:**
- Tests describe protocol behavior with descriptive names
- Each test documents a protocol requirement
- Tests demonstrate correct usage patterns
- Tests verify error handling and edge cases

**Coverage:**
- Broadcast with dead connections
- Message validation and error responses
- Handler error propagation
- Client reconnection scenarios
- Connection cleanup
- Full request/response cycles

### 3. **Protocol Documentation**

Create protocol guide in architecture fixtures:

**File**: `packages/nonlinear/lib/fixtures/architecture/websocket-protocol.md`

**Content:**
- Protocol overview and architecture
- Message format specification
- URL-based routing explanation
- Request/response pattern documentation
- Subscription/pub-sub documentation
- Error handling and error codes
- Connection lifecycle (connect, reconnect, cleanup)
- Usage examples and common patterns
- Agent usage guidelines

**Format:**
- Follow existing guide format (`patterns.md`, `index.md`)
- Clear sections with code examples
- Mermaid diagrams for protocol flow
- Agent-friendly structure (LLM-optimized)

**Integration:**
- Update `architecture/index.md` to reference protocol guide
- Link from Communication Patterns section
- Reference in Related ADRs section

## Consequences

### Positive

1. **Robustness**: System handles errors gracefully without crashes
2. **Reliability**: Dead connections are cleaned up, preventing memory leaks
3. **Developer Experience**: Clear error responses help debugging
4. **Documentation**: Protocol guide helps agents and developers understand the system
5. **Test Coverage**: Comprehensive tests prevent regressions and document behavior
6. **Backward Compatible**: All existing code continues to work

### Negative

1. **Additional Code**: More error handling code to maintain
2. **Test Maintenance**: Test suite needs to be kept up to date

### Neutral

1. **No API Changes**: Message format and API remain the same
2. **No Performance Impact**: Error handling adds minimal overhead
3. **Documentation Overhead**: Protocol guide needs updates when protocol changes

## Implementation Details

### Files to Modify

1. **`packages/common/lib/ws-server.ts`**
   - Add try-catch around `ws.send()` in broadcast/emitEvent
   - Add error response sending for all failure cases
   - Add dead connection cleanup method
   - Wrap all `ws.send()` calls in try-catch

2. **`packages/common/lib/ws-client.ts`**
   - Add message structure validation
   - Emit error events for malformed messages
   - Handle JSON parse failures gracefully

3. **`packages/nonlinear/lib/fixtures/architecture/index.md`**
   - Add WebSocket protocol reference
   - Update Communication Patterns section

### Files to Create

1. **`packages/common/tests/ws-server.test.ts`**
   - Server error handling tests
   - Broadcast robustness tests
   - Message handler error response tests

2. **`packages/common/tests/ws-client.test.ts`**
   - Client message validation tests
   - Error handling tests
   - Reconnection tests

3. **`packages/common/tests/ws-integration.test.ts`**
   - End-to-end protocol tests
   - Full request/response cycle tests
   - Multiple connection tests

4. **`packages/common/tests/helpers/test-server.ts`**
   - Test server helper for test setup

5. **`packages/common/tests/helpers/test-client.ts`**
   - Test client helper for test setup

6. **`packages/nonlinear/lib/fixtures/architecture/websocket-protocol.md`**
   - Comprehensive protocol guide

## Testing Strategy

### Test Execution

- All tests run via `bun run test` from workspace root
- Tests use Bun's native test runner
- Tests are fast and isolated
- Tests serve as executable documentation

### Test Coverage Goals

- All error handling paths covered
- All message validation scenarios covered
- Connection lifecycle fully tested
- Error response format verified
- Backward compatibility verified

## Documentation Strategy

1. **Tests as Primary Documentation**: Tests describe protocol behavior with descriptive names and comments
2. **Protocol Guide as Reference**: Guide provides overview and examples for agents
3. **Architecture Index Links**: Index connects protocol to overall architecture
4. **Agent-Friendly Format**: Documentation structured for LLM consumption

## Migration Path

No migration needed - changes are backward compatible:
- Existing code continues to work
- No API changes
- Only adds error handling and cleanup
- Tests verify backward compatibility

## Success Criteria

1. ✅ Broadcast doesn't crash on dead connections
2. ✅ All error cases send responses to client
3. ✅ Dead connections are cleaned up
4. ✅ Client handles malformed messages gracefully
5. ✅ All existing functionality still works
6. ✅ Test suite covers all error scenarios
7. ✅ Protocol guide documents the system for agents
8. ✅ `bun run test` passes
9. ✅ Tests serve as primary reference for protocol behavior

## References

- ADR-004: Preact + WebSocket Real-time Architecture
- ADR-006: REST to WebSocket Migration
- ADR-028: Agent Mention Processing with WebSocket Push
- `packages/common/lib/ws-server.ts` - WebSocket server implementation
- `packages/common/lib/ws-client.ts` - WebSocket client implementation
