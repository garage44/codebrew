# ADR-015: Unified Authentication Flow for Multi-Application Architecture

---
**Metadata:**
- **ID**: ADR-015
- **Status**: Proposed
- **Date**: 2025-01-27
- **Tags**: [frontend, backend, security, ux, architecture]
- **Impact Areas**: [expressio, pyrite, common]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-004, ADR-006]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

### Problem Statement

The Garage44 monorepo contains multiple applications (Expressio and Pyrite) with separate authentication flows that create friction for users:

1. **Multiple Login Screens**: Users must authenticate separately for admin access and conference access
2. **Credential Redundancy**: Same credentials entered multiple times across different interfaces
3. **Anonymous Group Friction**: Even anonymous-accessible groups require navigation through login screens
4. **State Fragmentation**: Authentication state scattered across different components and storage mechanisms
5. **Poor UX Flow**: Users experience authentication friction even for public content

### Current State Analysis

**Expressio Authentication:**
- Admin login at `/admin/login` authenticates against `.pyriterc` users
- Separate credential storage in session
- No integration with conference authentication

**Pyrite Authentication:**
- Conference login at `/groups/:groupId/login` for Galene group access
- Different credential storage mechanism
- No integration with admin authentication

**Common Package:**
- Shared state structure already exists in `packages/common/lib/state.ts`
- `volatileState.profile` has required fields: `admin`, `authenticated`, `password`, `username`
- No shared authentication components

### Business Drivers

- **User Experience**: Single sign-on reduces friction and improves adoption
- **Security**: Centralized credential management reduces attack surface
- **Maintenance**: Shared authentication logic reduces code duplication
- **Scalability**: Unified pattern supports future applications

### Constraints

- Must maintain backward compatibility with existing authentication endpoints
- Must support anonymous group access without authentication
- Must preserve existing security model for admin access
- Must work with existing WebSocket architecture (ADR-004)
- Must integrate with existing state management (DeepSignal)

## Decision

### 1. Create Shared Login Component in Common Package

**New Component**: `packages/common/components/ui/login/login.tsx`

Create a reusable, configurable login component that:
- Accepts `onLogin(username, password)` callback for authentication logic
- Supports optional `title` and `subtitle` props for application branding
- Uses existing FieldText components for form fields
- Manages local form state (username, password, errors, loading)
- Provides clean, minimal design that can be styled per application
- Handles error display and loading states

**New Styles**: `packages/common/components/ui/login/login.css`

Basic styling with modern CSS nesting:
- Centered login card layout
- Form field styling using existing CSS variables
- Button styling consistent with design system
- Error message display
- Responsive design for mobile/desktop

**Export Update**: `packages/common/components.ts`
- Export Login component for application consumption

### 2. Implement Root-Level Authentication Flow

**Pyrite Implementation**: `packages/pyrite/src/components/main/main.tsx`

- Show unified login screen when `$s.admin.authenticated === false`
- Use `<Login title="Pyrite" onLogin={handleLogin} />` component
- Implement `handleLogin` callback that:
  - Calls `/api/login` endpoint with credentials
  - Updates `$s.admin` state with authentication response
  - Stores credentials in `$s.profile.{username, password}` for Galene reuse
  - Sets `$s.admin.authenticated = true` on success
  - Returns error message for display on failure

**Expressio Implementation**: `packages/expressio/src/components/main/main.tsx`

- Replace existing login page with shared Login component
- Use `<Login title="Expressio" onLogin={handleLogin} />` component
- Maintain existing authentication logic in `handleLogin` callback
- Remove redundant login page components after migration

### 3. Implement Automatic Group Connection

**Group Context Updates**: `packages/pyrite/src/components/conference/context/context-groups.tsx`

When clicking group links:
- Check group configuration for anonymous access (`group['allow-anonymous']` and `group['public-access']`)
- If anonymous allowed: route directly to `/groups/${groupId}` and auto-connect
- If authentication required: route to `/groups/${groupId}` and auto-connect with stored credentials
- Remove navigation to `/groups/${groupId}/login` route

**Group Component Auto-Connect**: `packages/pyrite/src/components/conference/group/group.tsx`

Add connection logic in `useEffect`:
- On mount, check if already connected (`$s.group.connected`)
- If not connected, attempt auto-connection:
  - Load group configuration
  - Determine authentication type based on group settings
  - Call `connect()` with stored credentials or empty strings for anonymous
  - Handle connection errors and fallback to login screen if needed

**Conference App Routing**: `packages/pyrite/src/components/conference/app.tsx`

- Remove or modify `/groups/:groupId/login` route
- When routing to `/groups/:groupId`, check authentication state:
  - If anonymous group: connect anonymously
  - If credentials stored: connect with `$s.profile.{username, password}`
  - If connection fails with auth error: show login screen as fallback

### 4. Maintain Fallback Login Screen

**Conference Login Component**: `packages/pyrite/src/components/conference/login/login.tsx`

- Keep as fallback for connection failures
- Pre-populate with `$s.profile.{username, password}` if available
- Show only when auto-connect fails with authentication errors
- Maintain existing functionality for edge cases

### 5. Update Admin Application Flow

**Admin App Updates**: `packages/pyrite/src/components/admin/app.tsx`

- Remove admin login route since authentication happens at app root
- Update navigation to reflect unified authentication
- Ensure admin features are properly gated by authentication state

## Consequences

### Positive

- **Single Sign-On Experience**: Users authenticate once and access all features seamlessly
- **Reduced Friction**: Anonymous groups work without any authentication prompts
- **Unified State Management**: Single source of truth for authentication across applications
- **Code Reuse**: Shared login component reduces duplication and maintenance burden
- **Better UX Flow**: Logical progression from login to application features
- **Security Improvement**: Centralized credential management reduces attack surface
- **Developer Experience**: Consistent authentication patterns across applications

### Negative

- **Implementation Complexity**: Requires coordination across multiple components and applications
- **Migration Effort**: Existing authentication flows need careful migration to avoid breaking changes
- **State Synchronization**: Need to ensure authentication state stays synchronized across components
- **Fallback Complexity**: Multiple authentication paths require careful error handling
- **Testing Overhead**: More complex authentication flows require comprehensive testing scenarios

## Decision Pattern

**When to Apply This Pattern:**
- Multiple applications in monorepo with separate authentication needs
- Need for single sign-on experience across related applications
- Shared user base accessing different application features
- Requirement for seamless anonymous access to public content
- Need to reduce authentication friction while maintaining security

**When NOT to Apply:**
- Single application with simple authentication needs
- Applications with completely separate user bases
- High-security environments requiring separate authentication domains
- Applications with different authentication providers/backends

**Key Questions to Ask:**
1. Do users need to access multiple applications with the same credentials?
2. Are there public/anonymous features that should bypass authentication?
3. Is there shared user state that should persist across applications?
4. Would unified authentication improve user experience significantly?
5. Can authentication logic be safely shared without security concerns?

**Decision Criteria:**
- User Experience Impact: 9/10 (primary driver)
- Security Requirements: 8/10 (must maintain existing security model)
- Implementation Complexity: 6/10 (significant but manageable)
- Code Reuse Potential: 8/10 (high value for shared components)
- Maintenance Burden: 7/10 (reduces long-term maintenance)

**Success Metrics:**
- Authentication friction reduction: Target 50% fewer login prompts
- User session persistence: Target 100% credential persistence across page reloads
- Anonymous access success: Target 100% seamless access to public groups
- Code duplication reduction: Target 60% reduction in authentication-related code

## Rationale Chain

**Primary Reasoning:**
1. We chose unified authentication because it eliminates user friction while maintaining security
2. Shared login component enables code reuse and consistent UX across applications
3. Automatic group connection with stored credentials provides seamless experience
4. Fallback login screen ensures robust error handling for edge cases
5. Root-level authentication ensures single point of entry for all application features

**Alternatives Considered:**

### Alternative 1: Keep Separate Authentication Flows
- **Pros**: Simpler implementation, no coordination needed, existing code works
- **Cons**: Poor user experience, credential redundancy, maintenance overhead
- **Rejected Because**: User friction outweighs implementation simplicity, violates UX principles

### Alternative 2: Implement SSO with External Provider
- **Pros**: Industry standard, handles complex authentication scenarios, scalable
- **Cons**: External dependency, overkill for current needs, implementation complexity
- **Rejected Because**: Current authentication needs don't justify external SSO complexity

### Alternative 3: Session-Based Authentication Only
- **Pros**: Simple implementation, server-side session management
- **Cons**: Doesn't solve credential redundancy, limited offline capability
- **Rejected Because**: Doesn't address core UX friction of multiple login screens

**Trade-off Analysis:**
- We accepted implementation complexity to gain significant UX improvement
- We sacrificed some code independence for better user experience and code reuse
- We added fallback complexity to ensure robust error handling

**Assumptions:**
- Users will benefit from single sign-on experience (validate through user testing)
- Stored credentials are secure enough for Galene group authentication (validate security review)
- Anonymous group access is a common use case (validate through analytics)
- Shared authentication component will be reused by future applications (validate through architecture review)

## Code Context

**Files Created:**
- `/packages/common/components/ui/login/login.tsx` - Reusable login component with callback pattern
- `/packages/common/components/ui/login/login.css` - Basic styling with modern CSS nesting
- `/packages/common/components.ts` - Export Login component

**Files Modified:**
- `/packages/pyrite/src/components/main/main.tsx` - Add root-level authentication with shared Login component
- `/packages/pyrite/src/components/conference/context/context-groups.tsx` - Auto-route to groups, bypass login for anonymous
- `/packages/pyrite/src/components/conference/app.tsx` - Update routing logic for automatic connection
- `/packages/pyrite/src/components/conference/group/group.tsx` - Add auto-connect logic with stored credentials
- `/packages/pyrite/src/components/conference/login/login.tsx` - Keep as fallback, pre-populate credentials
- `/packages/pyrite/src/components/admin/app.tsx` - Remove admin login route
- `/packages/expressio/src/components/main/main.tsx` - Replace login page with shared Login component

**Implementation Pattern:**
```tsx
// ✅ Shared Login Component Pattern
import {Login} from '@garage44/common/components'

const AppMain = () => {
  const handleLogin = async (username: string, password: string) => {
    try {
      const response = await api.post('/api/login', {username, password})
      $s.admin = response.data
      $s.profile.username = username
      $s.profile.password = password
      $s.admin.authenticated = true
      return null // Success
    } catch (error) {
      return error.message // Error message for display
    }
  }

  if (!$s.admin.authenticated) {
    return <Login title="Application" onLogin={handleLogin} />
  }

  return <ApplicationContent />
}
```

**Auto-Connect Pattern:**
```tsx
// ✅ Group Auto-Connect Pattern
const GroupComponent = () => {
  useEffect(() => {
    if (!$s.group.connected) {
      const connectToGroup = async () => {
        const group = await loadGroupConfig()

        if (group['allow-anonymous'] && group['public-access']) {
          // Anonymous connection
          await connect('', '')
        } else if ($s.profile.username && $s.profile.password) {
          // Authenticated connection with stored credentials
          await connect($s.profile.username, $s.profile.password)
        } else {
          // Fallback to login screen
          showLoginScreen()
        }
      }

      connectToGroup()
    }
  }, [])
}
```

**Anti-patterns to Avoid:**
```tsx
// ❌ Don't create application-specific login components
const PyriteLogin = () => { /* Custom login logic */ }

// ❌ Don't store credentials in multiple places
$s.admin.credentials = {...}
$s.user.credentials = {...} // Duplication

// ❌ Don't force authentication for anonymous groups
if (!authenticated) {
  showLogin() // Wrong - check group settings first
}

// ✅ Do use shared component with callback pattern
const handleLogin = async (username, password) => { /* Logic */ }
return <Login onLogin={handleLogin} />
```

**Migration Path:**
1. Create shared Login component in common package
2. Update Pyrite main component to use shared Login with root-level authentication
3. Update Expressio main component to use shared Login component
4. Implement auto-connect logic in group components
5. Update group context to route directly to groups
6. Test all authentication scenarios thoroughly
7. Remove redundant login components and routes

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Does this decision align with ADR-004's WebSocket architecture for real-time updates?"
2. "How does this compare to the shared component patterns in ADR-012?"
3. "What are the security implications of sharing authentication state across applications?"
4. "Does this introduce new dependencies or coupling between applications?"

**Pattern Recognition Cues:**
- If you see multiple login screens in a monorepo, consider unified authentication
- If the problem involves user friction with repeated authentication, this ADR is relevant
- If requirements include seamless access to public content, review this decision's approach
- If you need to share components across applications, this pattern provides guidance

**Red Flags:**
- ⚠️ Proposing separate authentication for each application (contradicts unified approach)
- ⚠️ Storing credentials in multiple places (violates single source of truth)
- ⚠️ Forcing authentication for anonymous-accessible content (violates UX principles)
- ⚠️ Creating application-specific login components (violates code reuse principle)

**Consistency Checks:**
- Does this align with ADR-004's real-time WebSocket architecture?
- Does this contradict ADR-006's REST to WebSocket migration?
- Does this reinforce our shared component architecture principles?

## Architectural Implications

**Core Principles Affected:**
- **Component Reuse**: Reinforced - Shared Login component enables reuse across applications
- **User Experience**: Reinforced - Single sign-on reduces friction and improves adoption
- **State Management**: Modified - Authentication state becomes centralized and shared
- **Security**: Reinforced - Centralized credential management reduces attack surface

**System-Wide Impact:**
- **Package Boundaries**: Common package gains authentication components, applications depend on shared components
- **Communication Patterns**: Authentication state flows from root to child components, WebSocket connections use stored credentials
- **State Management**: DeepSignal state becomes single source of truth for authentication across applications
- **Build System**: No changes to build system, shared components work with existing bundling

**Coupling Changes:**
- Applications now depend on common package for authentication components
- Authentication state coupling between admin and conference features
- Removed coupling between separate login screens and credential storage

**Future Constraints:**
- New applications must use shared authentication components
- Authentication changes require coordination across applications
- Anonymous access patterns must be preserved for public content
- Credential storage format becomes a shared contract

## Related Decisions

- [ADR-004](./004-preact-ws.md): WebSocket architecture enables real-time authentication state updates
- [ADR-006](./006-ws-migration.md): WebSocket migration provides foundation for real-time authentication
- [ADR-012](./012-design-system.md): Shared component patterns guide Login component design

## References

- Original plan: `unified-authentication-flow.plan.md`
- WebSocket architecture: [ADR-004](./004-preact-ws.md)
- Shared component patterns: [ADR-012](./012-design-system.md)
- DeepSignal documentation: [DeepSignal GitHub](https://github.com/luisherranz/deepsignal)

---

## Template Usage Notes

**For LLMs creating similar ADRs:**
1. Focus on user experience impact when evaluating authentication decisions
2. Consider shared component patterns for cross-application functionality
3. Always maintain fallback mechanisms for robust error handling
4. Document security implications of shared authentication state
5. Provide clear migration paths for existing authentication flows

**For Humans reviewing this ADR:**
- Verify that security model is preserved while improving UX
- Ensure shared component design is reusable and maintainable
- Validate that anonymous access patterns are properly supported
- Confirm that migration path doesn't break existing functionality
