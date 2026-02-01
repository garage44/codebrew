# ADR-016: Three-Column Conference Layout with Right-Side Video Panel

---
**Metadata:**
- **ID**: ADR-016
- **Status**: Proposed
- **Date**: 2025-01-27
- **Tags**: [frontend, ux, architecture, pyrite]
- **Impact Areas**: [pyrite]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-004, ADR-011, ADR-012]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

### Problem Statement

Pyrite is transitioning from a **video-first paradigm** (similar to Galene) to a **chat-first paradigm** with optional video presence. The current layout doesn't reflect this paradigm shift and creates several issues:

1. **Paradigm Mismatch**: Layout still treats video as primary, but new paradigm prioritizes chat
2. **Awkward Control Placement**: The context-menu-groups bar appears as an unstyled white strip between panels
3. **Video-Chat Separation**: Video and chat exist in separate routes, making it unclear they're part of the same channel
4. **Presence Integration**: Video should support presence, not dominate the interface

### Historical Context: Paradigm Evolution

**Old Pyrite (Video-First Paradigm):**
- Started with a group list
- Login per group (similar to Galene's model)
- After login: **Main video canvas** (primary focus) + chat window (secondary)
- Video was the primary interface element
- Users logged into groups specifically for video conferencing

**New Pyrite (Chat-First Paradigm):**
- Starts with unified login
- Then shows channel list
- On each channel: **Chat is primary focus** (main canvas)
- Video is **additional and optional** for presence/awareness
- Channels are persistent communication spaces, not just video sessions
- Video supports presence but doesn't dominate the interface

### Current State Analysis

**Layout Structure:**
- Left: Context panel (channels/people list) via PanelContext
- Center: Router view showing either Channel component (chat) OR Group component (video)
- Middle: White unstyled bar containing GroupsContextMenu controls
- Right: Video panel with controls (when `$s.group.connected`)

**Key Understanding:**
- An active channel IS an active Galene group (they represent the same entity)
- Joining a channel should seamlessly enable optional video connection for presence
- Chat is the primary interface, video supports it

### Business Drivers

- **Paradigm Alignment**: Layout must reflect chat-first paradigm with optional video
- **User Experience**: Enable chat as primary interface with video supporting presence
- **Visual Clarity**: Make chat the center focus, video an optional enhancement
- **Control Accessibility**: Position video controls near video content without competing with chat
- **Layout Consistency**: Create a predictable three-column layout that prioritizes chat

### Constraints

- Must maintain compatibility with existing AppLayout component
- Must preserve Channel and Group component functionality
- Must work with existing DeepSignal state management (ADR-004)
- Must integrate with existing WebSocket architecture (ADR-004)
- Must follow modern CSS patterns (ADR-011, ADR-012)
- Must standardize panel naming across all applications (Expressio, Pyrite, Styleguide)

## Decision

### 1. Three-Column CSS Grid Layout (Chat-First)

**Layout Structure:**
```
┌─────────┬───────────────────────┬──────────────┐
│ Menu    │   Chat Canvas         │  Context     │
│ Panel   │   (PRIMARY FOCUS)     │  Panel       │
│         │   Channel View        │  (Controls   │
│         │                       │   + Video)   │
└─────────┴───────────────────────┴──────────────┘
```

- **Left Column**: PanelMenu (channels/people list) - fixed width via CSS Grid column
- **Center Column**: Channel component (chat canvas) - **PRIMARY INTERFACE** - `1fr` (fills available space)
- **Right Column**: PanelContext (controls + video panel) - **OPTIONAL** - variable width (narrow → wide) via CSS Grid column

**Key Design Principle**: Chat occupies the center as the primary interface. Video appears on the right as an optional presence indicator, not competing for attention.

**CSS Grid Implementation:**
- Use CSS Grid instead of flexbox for better control over three-column layout
- Grid template: `[menu] [content] [context]` with responsive column sizing
- Menu: `minmax(min-content, 240px)` - collapses to `64px` when collapsed
- Content: `1fr` - fills remaining space (chat primary)
- Context: `minmax(64px, auto)` - narrow for controls, expands to `300-400px` with video

### 2. Component Naming Refactoring

**Panel Naming Standardization:**
- **PanelMenu** (formerly PanelContext): Left sidebar with navigation, logo, actions
  - Renamed to reflect its purpose as navigation/menu panel
  - Used across Expressio, Pyrite, Styleguide
  - Maintains all existing functionality (collapse, navigation, actions, footer)

- **PanelContext** (new): Right sidebar for contextual content
  - Generic right-side panel component
  - Used for video controls + video tiles in Pyrite
  - Can be used for other contextual content in future applications
  - Adapts width based on content (narrow for controls, wide for video)

**AppLayout Component:**
- Enhanced to support three-column grid layout
- Props: `menu?: ComponentChildren`, `context?: ComponentChildren`, `children: ComponentChildren`
- Uses CSS Grid: `grid-template-columns: [menu] minmax(...) [content] 1fr [context] minmax(...)`
- Two-column layout when context not provided (automatic via CSS Grid)

### 3. PanelContext Component (Right Sidebar)

Create new `PanelContext` component in common package for right-side panels:

**Component Structure:**
- Generic right-side panel component
- Accepts `children` for flexible content
- Supports collapse/expand functionality
- Width adapts based on content and collapsed state

**Pyrite Usage:**
- Contains PanelContextVideo (video controls) at top
- Contains video tiles vertical strip (when `$s.group.connected`) at bottom
- Narrow width (~64px) when collapsed or controls-only
- Expands to ~300-400px when video tiles shown

**Note on Terminology:**
- "Groups" terminology is deprecated in Pyrite UI
- Use "channel" terminology in UI (channels are the user-facing concept)
- "Groups" only used for backend/Galene communication (internal implementation detail)
- Component named PanelContextVideo (not GroupsContextMenu) to reflect this

### 4. Video Tiles Vertical Layout

- Display video tiles as a vertical strip (single column)
- Adapt Group component or create VideoStrip component
- Preserve aspect ratio but optimize for vertical stacking
- Enable smooth scrolling for many participants

### 5. Seamless Channel-to-Group Connection (Optional)

- When a channel is selected, chat becomes active immediately (primary interface)
- Optionally and seamlessly connect to associated Galene group for video presence
- Ensure `$s.group.connected` reflects channel connection state
- Video tiles strip appears automatically when channel has active video connection
- **Video is additive, not required** - chat works independently

### 6. Layout CSS Updates (CSS Grid)

**AppLayout Component:**
- Convert from flexbox to CSS Grid
- Props: `menu?: ComponentChildren`, `context?: ComponentChildren`, `children: ComponentChildren`
- Grid template: `grid-template-columns: [menu] minmax(min-content, 240px) [content] 1fr [context] minmax(64px, auto)`
- Grid areas: `menu` | `content` | `context`
- Responsive: Context panel collapses when not needed
- Two-column layout when context not provided (via CSS Grid conditional)

**Conference App:**
- Use AppLayout with menu, content, and context props
- Center content area automatically fills available space via `1fr`
- Right panel (PanelContext) transitions from narrow (~64px) to wide (~300-400px) when video tiles shown
- Remove absolute positioning from video panels and layout components

**Grid Benefits:**
- Better control over column sizing and responsive behavior
- Cleaner separation of layout concerns
- Easier to add/remove columns without affecting others
- Native support for variable-width panels

## Consequences

### Positive

- **Chat-First Paradigm**: Chat is primary interface, reflecting new application paradigm
- **Optional Video Presence**: Video supports presence without dominating the interface
- **Simultaneous Viewing**: Users can see video tiles and chat messages at the same time when video is active
- **Clear Visual Hierarchy**: Three-column layout makes chat primary, video secondary
- **Improved Control Access**: Video controls positioned logically with video tiles
- **Seamless Experience**: Channel selection enables chat immediately, video connection is optional
- **Space Efficiency**: Right panel expands only when needed, preserves screen real estate for chat
- **Standardized Components**: Consistent panel naming (PanelMenu, PanelContext) across all applications
- **CSS Grid Benefits**: Better layout control, easier responsive behavior, native variable-width support
- **Component Reuse**: Generic PanelContext component can be reused for other contextual content

### Negative

- **Implementation Complexity**: Requires restructuring app layout, component positioning, and component renaming
- **CSS Migration**: Need to convert from flexbox/absolute to CSS Grid positioning
- **Component Refactoring**: PanelContext → PanelMenu rename affects all applications (Expressio, Pyrite, Styleguide)
- **Component Integration**: Must ensure Group component works in vertical strip layout
- **State Coordination**: Channel and group connection states must be synchronized
- **Migration Effort**: All applications need updates to use new component names

## Decision Pattern

**When to Apply This Pattern:**
- Multiple related views (video, chat, controls) need to coexist
- Layout needs to accommodate variable-width side panels
- Controls should be co-located with the content they control
- Real-time collaboration features require simultaneous information display
- Need standardized three-column layout across multiple applications
- CSS Grid provides better control than flexbox for complex multi-column layouts

**When NOT to Apply:**
- Single-view applications with simple navigation
- Mobile-first designs requiring stacked layouts
- Applications where video/chat are truly separate features
- Simple two-column layouts that work well with flexbox

**Key Questions to Ask:**
1. Is chat the primary interface, with video as optional presence?
2. Do users need to see chat and video simultaneously when both are active?
3. Should controls be positioned near the content they affect?
4. Does the layout need to adapt dynamically based on whether video is active?

**Decision Criteria:**
- Paradigm Alignment: 10/10 (critical - must reflect chat-first paradigm)
- User Experience Impact: 9/10 (primary driver - chat primary, video optional)
- Layout Clarity: 9/10 (CSS Grid provides clearer three-column structure)
- Component Standardization: 8/10 (unified naming improves consistency)
- Implementation Complexity: 7/10 (significant refactoring + renaming + CSS Grid migration)
- Space Efficiency: 8/10 (adaptive panel sizing, chat gets most space)

**Success Metrics:**
- Video + Chat visibility: 100% simultaneous display when connected
- Control accessibility: <2 clicks to access any video control
- Layout responsiveness: Smooth transitions between narrow/wide panel states
- User comprehension: Clear understanding that channel = video group

## Rationale Chain

**Primary Reasoning:**
1. Chat-first paradigm requires chat as primary interface, not video
2. Three-column CSS Grid layout puts chat in center (primary focus), video on right (optional presence)
3. Right-side panel positioning places controls logically near video content without competing with chat
4. Vertical video strip maximizes presence visibility while minimizing space competition with chat
5. Seamless channel-to-group connection enables optional video without disrupting chat workflow
6. CSS Grid provides better control over three-column layout with variable-width panels
7. Component naming standardization (PanelMenu, PanelContext) improves consistency across applications

**Alternatives Considered:**

### Alternative 1: Keep Current Routing-Based Separation
- **Pros**: Simpler implementation, existing code works
- **Cons**: Video and chat cannot be viewed simultaneously, poor UX
- **Rejected Because**: Core requirement is simultaneous viewing of video and chat

### Alternative 2: Video Panel in Center, Chat on Right
- **Pros**: Video gets more space (matches old paradigm)
- **Cons**: Contradicts new chat-first paradigm, chat feels secondary
- **Rejected Because**: New paradigm requires chat as primary interface, video as optional presence

### Alternative 3: Tabbed Interface (Video/Chat Tabs)
- **Pros**: Simple toggle between views
- **Cons**: Cannot see both simultaneously, contradicts requirement
- **Rejected Because**: Requirement explicitly needs simultaneous viewing

**Trade-off Analysis:**
- We accepted implementation complexity to align with chat-first paradigm
- We prioritized chat as primary interface over video-first approach (paradigm shift)
- We chose adaptive panel width over fixed sizing to preserve chat space when video inactive
- We enabled optional video presence without requiring it (chat works independently)

**Assumptions:**
- Chat-first paradigm is the correct direction for Pyrite's use case (validate through user research)
- Users will benefit from chat as primary interface with optional video presence (validate through testing)
- Vertical video strip is acceptable for presence visibility without dominating interface (validate with user feedback)
- Channel = Group relationship will be clear through seamless connection (validate through UX testing)
- Optional video presence enhances collaboration without being required (validate through usage analytics)

## Code Context

**Files to Create:**
- `/packages/common/components/ui/panel-menu/panel-menu.tsx` - Renamed from PanelContext (left sidebar)
- `/packages/common/components/ui/panel-menu/panel-menu.css` - Styles for menu panel
- `/packages/common/components/ui/panel-context/panel-context.tsx` - NEW: Generic right-side panel component
- `/packages/common/components/ui/panel-context/panel-context.css` - NEW: Styles for context panel (right sidebar)

**Files to Modify:**
- `/packages/common/components/ui/app-layout/app-layout.tsx` - Add menu and context props, convert to CSS Grid
- `/packages/common/components/ui/app-layout/app-layout.css` - Convert from flexbox to CSS Grid layout
- `/packages/common/components.ts` - Export PanelMenu (renamed), PanelContext (new right panel)
- `/packages/pyrite/src/components/conference/app.tsx` - Use AppLayout with menu/context props
- `/packages/pyrite/src/components/conference/group/group.tsx` - Adapt for vertical strip layout OR create VideoStrip component
- `/packages/pyrite/src/components/conference/chat/channel-chat.tsx` - Ensure works in center area
- `/packages/pyrite/src/components/conference/video/panel-context-video.tsx` - Rename from GroupsContextMenu to PanelContextVideo, video controls for PanelContext

**Files to Delete (Legacy):**
- `/packages/pyrite/src/components/conference/chat/panel-chat.tsx` - Legacy component from old Pyrite, no longer used
- `/packages/pyrite/src/components/conference/chat/panel-chat.css` - Legacy styles for PanelChat

**Files to Clean Up:**
- `/packages/pyrite/src/css/app.css` - Remove references to `.c-panel-chat` and `panel-chat-toggle` (lines 18-22)

**Files to Modify (Continued):**
- `/packages/expressio/src/components/main/main.tsx` - Update to use PanelMenu (renamed from PanelContext) and AppLayout menu prop
- `/packages/styleguide/src/components/main.tsx` - Update to use PanelMenu (renamed from PanelContext) and AppLayout menu prop

**Implementation Pattern:**
```tsx
// ✅ Three-Column CSS Grid Layout Pattern with AppLayout
import {AppLayout, PanelMenu, PanelContext} from '@garage44/common/components'

const ConferenceApp = () => {
  return (
    <AppLayout
      menu={
        <PanelMenu
          collapsed={$s.panels.menu.collapsed}
          navigation={<ChannelsContext />}
          // ... other props
        />
      }
      context={
        $s.group.connected && (
          <PanelContext>
            <VideoStrip streams={$s.streams} /> {/* Bottom: Video tiles */}
          </PanelContext>
        )
      }
    >
      <Router>
        <Route path="/channels/:channelId" component={Channel} />
      </Router>
    </AppLayout>
  )
}
```

**AppLayout CSS Grid Pattern:**
```css
/* ✅ CSS Grid Layout */
.c-app-layout {
  display: grid;
  grid-template-columns:
    [menu] minmax(min-content, 240px)
    [content] 1fr
    [context] minmax(64px, auto);
  height: 100vh;

  /* When context not provided, two-column layout */
  &:not(:has(.c-panel-context)) {
    grid-template-columns: [menu] minmax(min-content, 240px) [content] 1fr;
  }
}

/* Alternative: Use CSS Grid conditional columns */
.c-app-layout {
  display: grid;
  grid-template-columns:
    [menu] minmax(min-content, 240px)
    [content] 1fr
    [context-start] minmax(64px, auto) [context-end];
  height: 100vh;

  /* Hide context column when empty */
  &:not(:has(.c-panel-context)) {
    grid-template-columns:
      [menu] minmax(min-content, 240px)
      [content] 1fr;
  }
}
```

**PanelContext Pattern:**
```tsx
// ✅ Generic Right Panel Pattern
const PanelContext = ({children, collapsed}: PanelContextProps) => {
  return (
    <div class={classnames('c-panel-context', {collapsed})}>
      {children}
    </div>
  )
}
```

**Anti-patterns to Avoid:**
```tsx
// ❌ Don't use absolute positioning for panels
.c-panel-context {
  position: absolute;
  right: 0;
}

// ❌ Don't use flexbox for three-column layout
.c-app-layout {
  display: flex; // Not ideal for three columns with variable widths
}

// ❌ Don't hide video when chat is open
{!showChat && <Group />}

// ✅ Do use CSS Grid for layout
.c-app-layout {
  display: grid;
  grid-template-columns: [menu] ... [content] 1fr [context] ...;
}

// ✅ Do use AppLayout with menu/context props
<AppLayout menu={<PanelMenu />} context={<PanelContext />}>
  {/* Content */}
</AppLayout>

// ✅ Do show video and chat simultaneously
<AppLayout
  menu={<PanelMenu />}
  context={<PanelContext><VideoStrip /></PanelContext>}
>
  <Channel /> {/* Center */}
</AppLayout>
```

**Migration Path:**
1. Rename PanelContext to PanelMenu in common package
2. Create new PanelContext component for right sidebar
3. Update AppLayout to use CSS Grid with menu/context props
4. Update Pyrite to use AppLayout with PanelMenu and PanelContext
5. Update Expressio to use PanelMenu (renamed from PanelContext)
6. Update Styleguide to use PanelMenu (renamed from PanelContext)
7. Adapt Group component for vertical strip or create VideoStrip
8. Implement seamless channel-to-group connection
9. Test all layout states (narrow/wide panel, with/without video)
10. Remove absolute positioning from all panels

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Does this decision align with ADR-004's WebSocket architecture for real-time updates?"
2. "How does this compare to layout patterns in ADR-012's design system?"
3. "What are the CSS implications given ADR-011's modern CSS migration?"
4. "Does this introduce coupling between channel and video components?"

**Pattern Recognition Cues:**
- If you see video and chat in separate routes, consider simultaneous display
- If controls are awkwardly positioned, consider co-location with content
- If multiple related views exist, consider multi-column layouts
- If space efficiency matters, consider adaptive panel sizing

**Red Flags:**
- ⚠️ Proposing separate routes for video and chat (contradicts simultaneous viewing)
- ⚠️ Using absolute positioning for layout (contradicts modern CSS patterns)
- ⚠️ Hiding one view to show another (contradicts user requirement)
- ⚠️ Placing controls away from controlled content (violates UX principles)

**Consistency Checks:**
- Does this align with ADR-004's real-time WebSocket architecture?
- Does this follow ADR-011's modern CSS patterns (CSS Grid, no absolute positioning)?
- Does this respect ADR-012's design system principles?
- Are all applications using consistent component naming (PanelMenu, PanelContext)?

## Architectural Implications

**Core Principles Affected:**
- **Application Paradigm**: Shifted - From video-first (Galene-like) to chat-first with optional presence
- **Layout Structure**: Modified - Three-column CSS Grid replaces routing-based separation, prioritizes chat
- **Component Standardization**: Reinforced - Unified naming (PanelMenu, PanelContext) across all applications
- **Component Co-location**: Reinforced - Controls positioned with related content
- **User Experience**: Reinforced - Chat as primary interface, video as optional enhancement
- **CSS Architecture**: Modified - CSS Grid replaces flexbox for better multi-column control

**System-Wide Impact:**
- **Component Structure**: PanelContext renamed to PanelMenu, new PanelContext for right sidebar, AppLayout enhanced
- **CSS Architecture**: Migration from flexbox/absolute to CSS Grid positioning
- **Component Naming**: Standardized across Expressio, Pyrite, Styleguide (all use PanelMenu)
- **State Management**: Channel and group connection states must be synchronized
- **Routing**: Channel routing remains, but video display no longer route-dependent

**Coupling Changes:**
- Channel selection now triggers group connection automatically
- Video panel visibility depends on group connection state
- Reduced coupling between routing and video display

**Future Constraints:**
- New features must respect chat-first paradigm (chat is primary, video is optional)
- New video features must work within vertical strip layout without competing with chat
- Additional side panels should respect three-column structure and chat priority
- Layout changes must maintain chat as primary interface, video as optional presence

## Related Decisions

- [ADR-004](./004-preact-ws.md): WebSocket architecture enables real-time video and chat updates
- [ADR-011](./011-css.md): Modern CSS migration provides CSS Grid foundation for layout
- [ADR-012](./012-design-system.md): Design system consolidation guides component positioning

## References

- Original plan: Conference app layout restructure plan
- WebSocket architecture: [ADR-004](./004-preact-ws.md)
- Modern CSS: [ADR-011](./011-css.md) - CSS Grid support
- Design system: [ADR-012](./012-design-system.md)
