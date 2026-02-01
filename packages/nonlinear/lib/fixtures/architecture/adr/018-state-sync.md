# ADR-018: Video Conferencing Implementation Strategy

---
**Metadata:**
- **ID**: ADR-018
- **Status**: Proposed
- **Date**: 2025-01-27
- **Tags**: [frontend, architecture, pyrite, state-management, migration]
- **Impact Areas**: [pyrite]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-004, ADR-016, ADR-017]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

### Problem Statement

Video conferencing functionality was broken during Pyrite's migration to the new stack (Preact, DeepSignal, Bun). The frontend video flow needs to be rebuilt step-by-step, focusing first on basic connectivity and stream creation, then extending with advanced features.

**Key Issues:**
1. **Stream creation flow is broken** - Button actions in `GroupControls` (`toggleCam`, `toggleMicrophone`) don't properly trigger stream creation
2. **Stream mounting logic disconnected** - `mountUpstream`/`mountDownstream` exist but aren't wired to user actions
3. **Remote stream handling broken** - Already-connected clients should be handled via Galene RTP messages (`ondownstream`), not manual creation
4. **State synchronization missing** - Stream updates don't propagate to `$s.streams` (future phase)
5. **Migration broke entire flow** - Porting broke the frontend video conferencing completely

### Current State Analysis

**Working:**
- SFU connection via Galene WebSocket proxy (ADR-017)
- Authentication and group joining (`connect()` in `sfu.ts`)
- Stream component rendering logic (`Stream` component with `mountUpstream`/`mountDownstream`)
- Stream state structure (`$s.streams` array created by `sfu.ts`)

**Broken:**
- Button actions (`toggleCam` in `GroupControls`) call `media.getUserMedia()` but stream creation flow is incomplete
- `addUserMedia()` in `sfu.ts` creates upstream stream but doesn't properly connect to rendering
- Remote streams (`ondownstream` handler) create stream objects but mounting may fail
- Stream state synchronization (Phase 2 - not yet addressed)
- Volume controls, settings persistence (Phase 3 - not yet addressed)

### Historical Context

The original Pyrite worked with a different architecture. During migration to:
- Preact (from Vue)
- DeepSignal (from Vue reactivity)
- Bun (from Node.js)

The video conferencing flow was broken. Rather than trying to fix everything at once, we need to rebuild systematically:

1. **Phase 1**: Basic connectivity - get streams appearing when buttons clicked
2. **Phase 2**: State synchronization - ensure stream updates reflect in UI
3. **Phase 3**: Advanced features - volume, settings, screen share, etc.

### Business Drivers

- **Working Video Conferencing**: Core requirement - users must be able to share video/audio
- **Reliable Stream Creation**: Button actions must consistently create and display streams
- **Remote Stream Handling**: Already-connected clients must appear automatically via Galene RTP
- **Progressive Enhancement**: Rebuild in phases, ensuring each phase works before adding complexity
- **Simple Architecture**: Use `$s` global state to keep component-model interactions simple and maintainable

### Constraints

- Must use DeepSignal for reactive state (ADR-004)
- Must use `$s` global state as single source of truth for all stream data
- Must keep component-model interactions simple via shared `$s` state
- Must work with existing SFU connection (ADR-017)
- Must preserve existing `Stream` component architecture
- Must work with both Group (main view) and VideoStrip (side panel) rendering
- Must handle Galene's RTP protocol correctly (downstream streams via `ondownstream`)

### State Management Principle

**Key Insight**: Using `$s` global state simplifies interactions between components and models.

**Current Pattern:**
- Models (`sfu.ts`, `media.ts`) mutate `$s.streams` directly
- Components (`Stream`, `Group`, `VideoStrip`) read from `$s.streams` reactively
- No prop drilling or complex event systems needed
- DeepSignal provides automatic reactivity when `$s.streams` changes

**Example:**
```tsx
// Model (sfu.ts) - writes to $s
export async function addUserMedia() {
    const {glnStream, streamState} = newUpStream()
    glnStream.onnegotiationcompleted = () => {
        $s.streams.push(streamState) // Direct mutation
    }
}

// Component (Group) - reads from $s
const sortedStreams = useMemo(() => {
    return [...$s.streams].toSorted(...) // Reactive read
}, [$s.streams])

// Stream automatically appears when added to $s.streams
```

## Decision

### Phased Rebuild Strategy

**Phase 1: Basic Connectivity and Stream Creation - VideoStrip Only (Current Focus)**
- Fix button actions in `GroupControls` to trigger stream creation
- Ensure `addUserMedia()` properly creates upstream stream and adds to `$s.streams`
- Verify `Stream` component mounts upstream streams correctly (needs testing/fixing)
- Verify remote streams appear automatically via Galene `ondownstream` handler
- Focus on `VideoStrip` component only - simpler, easier to test
- **Defer**: `Group` component (fullscreen view with layout algorithm) - can extract layout algorithm later if needed
- **Success Criteria**: Click camera/mic button → stream appears in VideoStrip panel

**Phase 2: State Synchronization (Next Phase)**
- Add `onUpdate` callbacks to `VideoStrip` component
- Synchronize stream state updates (`hasAudio`, `hasVideo`, `playing`, etc.) to `$s.streams`
- Ensure bidirectional sync between component state and global state
- **Defer**: `Group` component state synchronization until Group component is rebuilt
- **Success Criteria**: Stream state changes (track status, volume) persist and reflect in VideoStrip UI

**Phase 3: Advanced Features (Future Phase)**
- Volume controls persistence
- Stream settings loading and display
- Screen sharing functionality
- File streaming functionality
- **Success Criteria**: All advanced features work reliably

### Phase 1 Implementation Details

**1. Stream Creation Flow**

**Current Flow (Broken):**
```
User clicks camera button
  → toggleCam() in GroupControls
  → media.getUserMedia($s.devices)
  → localStream created
  → sfu.addUserMedia() called
  → Stream object created in sfu.ts
  → Stream component should mount but may fail
```

**Fixed Flow:**
```
User clicks camera button
  → toggleCam() in GroupControls
  → media.getUserMedia($s.devices)
  → localStream created
  → sfu.addUserMedia() called
  → Stream object created and added to $s.streams (model writes to global state)
  → Stream component detects new stream in $s.streams (component reads from global state)
  → mountUpstream() called automatically (DeepSignal reactivity)
  → Video element receives MediaStream
  → Stream appears in UI
```

**Key Principle**: `$s` global state is the single source of truth. Models write to it, components read from it reactively. No complex event systems or prop drilling needed.

**Files to Fix:**
- `packages/pyrite/src/components/conference/controls/controls-group.tsx` - Verify button actions
- `packages/pyrite/src/models/media.ts` - Ensure `getUserMedia()` properly calls `sfu.addUserMedia()`
- `packages/pyrite/src/models/sfu/sfu.ts` - Verify `addUserMedia()` creates stream and adds to `$s.streams`
- `packages/pyrite/src/components/conference/stream/stream.tsx` - **Needs testing/fixing** - mounting logic untested and probably broken
- `packages/pyrite/src/components/conference/video/video-strip.tsx` - Focus on this component only
- **Defer**: `packages/pyrite/src/components/conference/group/group.tsx` - Probably broken, focus on VideoStrip first

**2. Remote Stream Handling**

**Galene Protocol:**
- When a user joins a group, Galene sends RTP messages for existing streams
- `ondownstream` handler in `sfu.ts` receives these and creates stream objects
- Stream objects are automatically added to `$s.streams` via `onDownStream()` handler (model writes to global state)
- `Stream` component detects new streams in `$s.streams` reactively (component reads from global state)
- `mountDownstream()` called automatically via DeepSignal reactivity

**Verification:**
- Ensure `onDownStream()` in `sfu.ts` properly adds streams to `$s.streams` (model responsibility)
- Verify `Stream` component detects new downstream streams reactively (component responsibility - needs testing)
- Test with multiple users to ensure remote streams appear automatically in VideoStrip via `$s.streams` changes

**3. Stream Component - Testing and Fixing Required**

**Current Status:**
- Stream component rendering is **untested and probably broken**
- Mounting logic (`mountUpstream`/`mountDownstream`) exists but needs verification
- Focus on making Stream component work correctly first, then integrate with VideoStrip

**mountUpstream Issues to Verify:**
- Ensure `glnStream.stream` is properly set before mounting
- Verify `mediaRef.current.srcObject` receives the MediaStream correctly
- Ensure `playStream()` is called after stream is assigned
- Test with local camera/mic button actions

**mountDownstream Issues to Verify:**
- Verify `glnStream.stream` is used correctly (not local `stream` state)
- Ensure `ondowntrack` handler properly updates stream state
- Verify `onstatus` handler correctly assigns stream to video element
- Test with remote users joining

**4. VideoStrip Component - Primary Focus**

**Current Status:**
- VideoStrip component exists and renders streams from `$s.streams`
- Simpler than Group component - easier to test and debug
- Renders in right-side panel (PanelContext) per ADR-016
- Vertical strip layout already implemented

**Focus Areas:**
- Ensure Stream component works correctly when rendered in VideoStrip
- Verify stream creation → appears in VideoStrip automatically
- Test remote streams appearing in VideoStrip via `$s.streams`

**Deferred: Group Component**
- Group component is probably broken (fullscreen view with layout algorithm)
- Layout algorithm in `group.tsx` may be extracted later for fullscreen view if needed
- Focus on VideoStrip first - simpler, more testable

## Consequences

### Positive

- **Phased Approach**: Allows validation at each step, reduces risk
- **Incremental Progress**: Can test basic functionality before adding complexity
- **Clear Success Criteria**: Each phase has measurable outcomes
- **Focused Debugging**: Issues isolated to specific phases
- **Learning Opportunity**: Understanding each layer before building next

### Negative

- **Multiple Phases**: Takes longer than fixing everything at once
- **Temporary Incomplete Features**: Some features won't work until later phases
- **Possible Refactoring**: Later phases may require adjustments to earlier work
- **Testing Overhead**: Each phase needs separate testing

## Decision Pattern

**When to Apply This Pattern:**
- Major functionality broken during migration/refactoring
- Complex system with multiple interdependent pieces
- Need to validate basic functionality before adding complexity
- Risk mitigation required - incremental progress preferred

**When NOT to Apply:**
- Simple bug fixes (fix directly)
- Well-understood system with clear error location
- Time pressure requires immediate complete fix
- All dependencies clearly understood

**Key Questions to Ask:**
1. Is the system too broken to fix all at once?
2. Can we identify distinct phases with clear success criteria?
3. Will each phase provide value independently?
4. Are dependencies between phases manageable?

**Decision Criteria:**
- System Complexity: 10/10 (critical - video conferencing has many moving parts)
- Migration Risk: 10/10 (high - porting broke everything)
- Incremental Value: 9/10 (each phase provides working functionality)
- Implementation Complexity: 7/10 (phased approach is actually simpler)
- Testing Confidence: 9/10 (can validate each phase independently)

**Success Metrics:**
- Phase 1: Stream appears in VideoStrip within 2 seconds of button click
- Phase 1: Remote streams appear automatically in VideoStrip when user joins
- Phase 1: Stream component mounting logic works correctly (needs testing/fixing)
- Phase 2: Stream state updates reflect immediately in VideoStrip UI
- Phase 3: All advanced features work reliably
- **Deferred**: Group component fullscreen view with layout algorithm (can extract algorithm later)

## Rationale Chain

**Primary Reasoning:**
1. Video conferencing completely broken - too complex to fix all at once
2. Phased approach allows validation at each step (reduce risk)
3. Basic connectivity (Phase 1) must work before advanced features (Phase 2/3)
4. Button actions → stream creation is foundation for everything else
5. Remote stream handling via Galene RTP is core requirement
6. State synchronization (Phase 2) requires Phase 1 to be working
7. Progressive enhancement reduces debugging complexity

**Alternatives Considered:**

### Alternative 1: Fix Everything At Once
- **Pros**: Complete solution, no temporary incomplete states
- **Cons**: Too complex, high risk, hard to debug
- **Rejected Because**: System too broken, dependencies unclear, high risk of failure

### Alternative 2: Rewrite From Scratch
- **Pros**: Clean slate, no legacy baggage
- **Cons**: Lose working parts (SFU connection, Stream component), very slow
- **Rejected Because**: Too much working code to throw away, unnecessary risk

**Trade-off Analysis:**
- Accepted phased approach over complete fix (risk mitigation)
- Chose incremental validation over big-bang fix (debugging ease)
- Prioritized basic connectivity over advanced features (foundation first)
- Enabled progressive enhancement over all-or-nothing (manageable complexity)

**Assumptions:**
- Stream creation flow issues are fixable with proper wiring (validate in Phase 1)
- Galene RTP protocol handling works correctly (test in Phase 1)
- Stream component mounting logic is sound (verify in Phase 1)
- State synchronization can be added without breaking Phase 1 (validate in Phase 2)

## Code Context

### Phase 1 Files to Fix

**Stream Creation:**
- `/packages/pyrite/src/components/conference/controls/controls-group.tsx`
  - Verify `toggleCam()` properly calls `media.getUserMedia()`
  - Ensure camera button state reflects stream status
- `/packages/pyrite/src/models/media.ts`
  - Verify `getUserMedia()` properly calls `sfu.addUserMedia()` when connected
  - Ensure local stream is properly stored and passed to SFU
- `/packages/pyrite/src/models/sfu/sfu.ts`
  - Verify `addUserMedia()` creates stream object correctly
  - Ensure stream is added to `$s.streams` array
  - Verify `newUpStream()` properly sets up peer connection

**Stream Mounting:**
- `/packages/pyrite/src/components/conference/stream/stream.tsx`
  - Fix `mountUpstream()` to properly handle stream assignment
  - Fix `mountDownstream()` to use `glnStream.stream` correctly
  - Verify `playStream()` is called at correct time

**Remote Stream Handling:**
- `/packages/pyrite/src/models/sfu/sfu.ts`
  - Verify `onDownStream()` handler creates stream objects correctly
  - Ensure streams are added to `$s.streams` automatically (model writes to `$s`)
- `/packages/pyrite/src/components/conference/stream/stream.tsx`
  - Verify `mountDownstream()` is called for new remote streams (needs testing)
  - Test with multiple users to ensure automatic appearance in VideoStrip
- `/packages/pyrite/src/components/conference/video/video-strip.tsx`
  - Ensure remote streams appear automatically when added to `$s.streams` (component reads from `$s`)

### Phase 1 Implementation Pattern

```tsx
// ✅ Button Action → Stream Creation Pattern
const toggleCam = () => {
    $s.devices.cam.enabled = !$s.devices.cam.enabled // Update global state
    sfu.delUpMediaKind('camera')
    media.getUserMedia($s.devices) // Uses $s.devices, triggers stream creation
}

// ✅ Stream Creation in media.ts (Model writes to $s)
export async function getUserMedia(presence) {
    // ... get local stream ...
    if ($s.group.connected) { // Read from global state
        await sfu.addUserMedia() // Creates upstream stream, writes to $s.streams
    }
}

// ✅ Stream Creation in sfu.ts (Model writes to $s)
export async function addUserMedia() {
    const {glnStream, streamState} = newUpStream()
    glnStream.onnegotiationcompleted = () => {
        $s.streams.push(streamState) // Model writes directly to global state
    }
}

// ✅ Stream Component Auto-Mounting (Component reads from $s)
// Component reacts to $s.streams changes automatically via DeepSignal
// NOTE: This logic is untested and probably broken - needs fixing
useEffect(() => {
    if (modelValue.direction === 'up') mountUpstream()
    else mountDownstream()
}, [modelValue.id, modelValue.direction]) // modelValue comes from $s.streams

// ✅ VideoStrip Component (Primary Focus)
// Component reads from $s.streams reactively and renders Stream components
const VideoStrip = () => {
    const sortedStreams = useMemo(() => {
        return [...$s.streams].toSorted(...) // Read from global state
    }, [$s.streams])

    return (
        <div class="c-video-strip">
            {sortedStreams.map(stream => (
                <Stream modelValue={stream} /> // Stream component needs testing/fixing
            ))}
        </div>
    )
}
```

**State Management Pattern:**
- **Models** (`sfu.ts`, `media.ts`): Write to `$s` (create, update, delete streams)
- **Components** (`VideoStrip`): Read from `$s` reactively (DeepSignal) - **Primary focus**
- **Components** (`Stream`): Reads from `$s` via props, needs testing/fixing
- **Defer** (`Group`): Focus on VideoStrip first, Group later
- **No Events**: Direct state mutations trigger automatic reactivity
- **No Props**: Shared `$s` state eliminates prop drilling

### Phase 2 Files (Future)

- `/packages/pyrite/src/components/conference/video/video-strip.tsx` - Add `onUpdate` callback for state synchronization
- **Defer**: `/packages/pyrite/src/components/conference/group/group.tsx` - Add `onUpdate` callback when Group component is rebuilt
- State synchronization pattern (components update `$s.streams` via callbacks)

### Anti-patterns to Avoid

```tsx
// ❌ Don't manually create streams for remote clients
// Remote streams come via Galene RTP messages automatically
if (remoteUser) {
    // Don't do this - let ondownstream handle it
    createStreamForUser(remoteUser) // Wrong!
}

// ❌ Don't skip stream creation checks
const toggleCam = () => {
    media.getUserMedia($s.devices) // Missing connection check!
}

// ✅ Do verify connection before stream creation
const toggleCam = () => {
    if (!$s.group.connected) return
    media.getUserMedia($s.devices)
}

// ✅ Do let Galene handle remote streams
// ondownstream handler automatically creates streams - trust it
```

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Is this system too broken to fix all at once?"
2. "Can we identify distinct phases with clear success criteria?"
3. "Does this align with ADR-017's Galene connection architecture?"
4. "What are the dependencies between phases?"

**Pattern Recognition Cues:**
- System broken during migration → phased rebuild
- Multiple interdependent pieces → identify phases
- Basic functionality missing → start with foundation
- Complex system → progressive enhancement

**Red Flags:**
- ⚠️ Trying to fix everything at once for broken system
- ⚠️ Skipping basic functionality to work on advanced features
- ⚠️ Manual stream creation for remote clients (should use RTP messages)
- ⚠️ Not verifying each phase before moving to next

**Consistency Checks:**
- Does this align with ADR-017's Galene SFU connection?
- Does this follow ADR-004's DeepSignal reactive state with `$s` global state?
- Does this use `$s` as single source of truth (models write, components read)?
- Does this respect ADR-016's three-column layout?
- Are button actions properly wired to stream creation via `$s` state?

## Architectural Implications

**Core Principles Affected:**
- **Global State Management**: Reinforced - `$s` as single source of truth simplifies architecture
- **Model-Component Separation**: Reinforced - Models write to `$s`, components read from `$s` reactively
- **Progressive Enhancement**: Reinforced - Build foundation, then add features
- **Incremental Validation**: Modified - Validate each phase before proceeding
- **Risk Mitigation**: Reinforced - Phased approach reduces failure risk
- **System Reliability**: Reinforced - Each phase must work before next

**System-Wide Impact:**
- **Development Process**: Modified - Phased approach changes workflow
- **Testing Strategy**: Modified - Test each phase independently
- **User Experience**: Progressive - Basic features first, advanced later
- **Debugging Approach**: Improved - Issues isolated to specific phases

**Coupling Changes:**
- Stream creation now explicit flow (button → getUserMedia → addUserMedia → mount)
- Remote stream handling via Galene RTP (no manual creation needed)
- Stream mounting automatic (via useEffect detecting new streams in $s.streams)
- **Simplified Architecture**: `$s` global state eliminates need for complex event systems or prop drilling between components and models

**Future Constraints:**
- Phase 2 (state synchronization) requires Phase 1 to be complete
- Phase 3 (advanced features) requires Phase 2 to be complete
- Changes to Phase 1 may affect later phases
- Must validate each phase before proceeding

## Related Decisions

- [ADR-004](./004-preact-ws.md): DeepSignal reactive state management
- [ADR-016](./016-layout.md): Video rendering layout (Group, VideoStrip)
- [ADR-017](./017-galene.md): Galene SFU connection and RTP protocol

## References

- Original issue: Video conferencing broken during Pyrite migration
- Galene protocol: RTP message handling for remote streams
- Stream creation flow: Button actions → getUserMedia → addUserMedia → mount
