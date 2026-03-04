# ADR-035: Code Quality Improvement Roadmap

---
**Metadata:**
- **ID**: ADR-035
- **Status**: Proposed
- **Date**: 2026-03-04
- **Tags**: [architecture, code-quality, dry, typing, performance, style, llm-optimization]
- **Impact Areas**: [common, codebrew, expressio, pyrite, nonlinear]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-001, ADR-009, ADR-010, ADR-034, ADR-032, ADR-033]
- **Supersedes**: []
- **Superseded By**: []
---

## Decision

Adopt a **code quality improvement roadmap** across the Garage44 monorepo, organized into four pillars: **Architecture/DRY**, **Style/Consistency**, **Performance**, and **Typing for LLM Usability**. Implement improvements incrementally using a priority matrix (effort vs. impact).

**Approach**: Phased implementation starting with quick wins (P0/P1), then medium-effort improvements (P2), and finally larger refactors (P3). Each pillar has specific, actionable items.

**Key Constraints**:
- Must not change runtime behaviour when fixing types (per `.cursor/skills/typescript-typing/SKILL.md`)
- Must respect ADR-001 package boundaries
- Must maintain backward compatibility for standalone package operation

## Context

**Problem**: A codebase analysis identified opportunities to improve maintainability, reduce duplication, enforce consistency, optimize Codebrew integration performance, and strengthen typing to support both human developers and LLM-assisted workflows.

**Current State**:
- **DRY**: Placeholder component duplicated in expressio and pyrite codebrew plugins; Router class duplicated in 4 middleware files; requireAdmin duplicated in 3 packages (ADR-034)
- **Style**: CSS properties alphabetically sorted (stylelint); import sorting disabled in oxlint; object property order not enforced
- **Performance**: Codebrew eagerly imports all plugins; no lazy loading of sub-app bundles
- **Typing**: ~150+ files use `unknown`/`any`; heavy `Record<string, unknown>`; inline type assertions; API context types duplicated locally

**Requirements**:
- Reduce duplication without breaking standalone package operation
- Improve consistency for easier code navigation and reviews
- Optimize Codebrew initial load and bundle size
- Strengthen types for better IDE support and LLM code understanding

## Rationale

**Primary Reasoning**:
1. **DRY improvements** → Less maintenance burden, single source of truth, aligns with ADR-034
2. **Style consistency** → Predictable structure, easier diffs, faster onboarding
3. **Performance** → Better UX for Codebrew users, especially on slower connections
4. **Typing** → Better autocomplete, fewer runtime errors, improved LLM code comprehension (ADR-009)

**Alternatives Considered**:

| Alternative | Pros | Cons | Rejected Because |
|-------------|------|------|-------------------|
| Big-bang refactor | Complete in one pass | High risk, blocks other work | Incremental is safer |
| Style-only focus | Quick wins | Misses architecture/typing | Roadmap covers all pillars |
| Typing-only focus | Improves correctness | Doesn't address duplication | Need balanced approach |

## Implementation Roadmap

### Pillar 1: Architecture / DRY

| Priority | Item | Effort | Impact | Status |
|----------|------|--------|--------|--------|
| P0 | Extract CodebrewPlaceholder to `@garage44/common/components` | Low | Removes duplication | Pending |
| P0 | Fix inline styles in Placeholder (use CSS class per ADR-011) | Low | Style compliance | Pending |
| P1 | Extract Router to `@garage44/common/lib/router.ts` | Medium | ~150 lines removed | Pending |
| P1 | Extract requireAdmin to `@garage44/common/lib/middleware.ts` | Low | ~24 lines removed | Pending |
| P3 | createServiceBootstrap factory (ADR-034) | High | Reduces service boilerplate | Pending |
| P3 | createAppBootstrap factory (ADR-034) | High | Reduces app boilerplate | Pending |

### Pillar 2: Style / Consistency

| Priority | Item | Effort | Impact | Status |
|----------|------|--------|--------|--------|
| P2 | Configure oxfmt `sortImports` (or `experimentalSortImports`) for import order | Low | Consistent import order | Pending |
| P2 | Enable `eslint/sort-keys` in oxlint for object literal key ordering | Low | Consistency | Pending |

**oxfmt/oxlint rule ownership** (avoid collisions):
- **Import sorting** → oxfmt (formatter runs last in lint-staged; use `experimentalSortImports` in `.oxfmtrc.json`). Do NOT enable oxlint sort-imports—different algorithms would conflict.
- **Object key sorting** → oxlint (`eslint/sort-keys`). oxfmt only sorts package.json, not object literals—no collision.
- **CSS** → stylelint already enforces `order/properties-alphabetical-order`.

### Pillar 3: Performance (Codebrew)

| Priority | Item | Effort | Impact | Status |
|----------|------|--------|--------|--------|
| P2 | Lazy-load plugins when user navigates to app | Medium | Smaller initial bundle | Pending |
| P2 | Memoize or signal `getApps()` if called frequently | Low | Avoid unnecessary allocations | Pending |
| P2 | Verify code splitting for shared chunks | Low | Avoid duplicate common/preact | Pending |

### Pillar 4: Typing for LLM Usability

| Priority | Item | Effort | Impact | Status |
|----------|------|--------|--------|--------|
| P1 | Shared ApiContext/LoginResult types in `@garage44/common` | Low | Single source of truth | Pending |
| P1 | Replace inline `import('preact').ComponentType` with proper imports | Low | Cleaner, LLM-friendly | Pending |
| P2 | JSDoc on public APIs (registerApp, getApps, plugin contract) | Medium | Better LLM context | Pending |
| P2 | Extend Zod schemas for API validation (ADR-032, ADR-033) | Medium | Type-safe request/response | Pending |
| P3 | Reduce `Record<string, unknown>` with explicit interfaces | High | Stronger typing | Pending |

## Implementation Details

### File Paths (P0/P1)

| Item | Create | Modify |
|------|--------|--------|
| CodebrewPlaceholder | `packages/common/components/ui/codebrew-placeholder/codebrew-placeholder.tsx`, `codebrew-placeholder.css` | `packages/common/components.ts`, `packages/expressio/codebrew.tsx`, `packages/pyrite/codebrew.tsx` |
| Router | `packages/common/lib/router.ts` | `packages/codebrew/lib/middleware.ts`, `packages/expressio/lib/middleware.ts`, `packages/nonlinear/lib/middleware.ts`, `packages/pyrite/lib/middleware.ts` |
| requireAdmin | (add to existing) | `packages/common/lib/middleware.ts`, `packages/expressio/lib/middleware.ts`, `packages/nonlinear/lib/middleware.ts`, `packages/pyrite/lib/middleware.ts` |
| ApiContext/LoginResult | `packages/common/types/api.ts` | `packages/codebrew/src/components/main/main.tsx` |
| Inline ComponentType | — | `packages/nonlinear/codebrew.tsx` (lines 37, 42) |

### Component Structure

Common components follow `components/ui/{name}/{name}.tsx` + `{name}.css`. Bunchy auto-discovers CSS—no import needed. Root class: `.c-{name}` (e.g. `.c-codebrew-placeholder`). Add export to `packages/common/components.ts`.

### Router and requireAdmin Signatures

**Shared Router**: Use `session?: unknown` for compatibility with all consumers (codebrew, expressio, nonlinear, pyrite).

**requireAdmin** (identical across packages):
```typescript
(ctx: {session?: {userid?: string}}, next: (ctx: {session?: {userid?: string}}) => Promise<unknown>) => Promise<unknown>
```

### Implementation Order

1. P0: CodebrewPlaceholder (extract + fix inline styles together)
2. P1: Router, requireAdmin, ApiContext, inline ComponentType (can parallelize)
3. P2: oxfmt sortImports, oxlint sort-keys

### Verification

- **CodebrewPlaceholder**: `bun run lint:ts-syntax` in expressio, pyrite; verify build
- **Router/requireAdmin**: Run each package's `start` command; verify admin routes
- **ApiContext**: Verify codebrew login flow
- **sort-keys**: `bun run lint:ts-syntax` from root; expect violations until fixed

## Patterns

**Extraction Pattern (DRY)**:
```typescript
// ✅ Extract to common, import in packages
// packages/common/components/ui/codebrew-placeholder/codebrew-placeholder.tsx
export const CodebrewPlaceholder = ({ name }: { name: string }) => (
  <div class="c-codebrew-placeholder">
    <h2>{name}</h2>
    <p>Coming soon in Codebrew</p>
  </div>
)
```

**Shared API Types**:
```typescript
// ✅ packages/common/types/api.ts
export interface ApiContext {
  admin?: boolean | string
  authenticated?: boolean
  id?: string
  profile?: { avatar?: string; displayName?: string }
  username?: string
}
```

**Anti-patterns**:
```typescript
// ❌ Inline type assertion - hard for LLMs to trace
component: ((props: Record<string, unknown>) => ...) as import('preact').ComponentType

// ✅ Proper import at top of file
import type { ComponentType } from 'preact'
component: ((props: RouteProps) => ...) as ComponentType<RouteProps>
```

## Consequences

**Positive**:
- Reduced duplication: ~200+ lines removed in P0/P1 items
- Consistent style: easier code reviews and navigation
- Faster Codebrew load: lazy plugin loading reduces initial bundle
- Better LLM support: explicit types and JSDoc improve AI comprehension

**Negative**:
- Incremental work: roadmap spans multiple iterations
- Risk of scope creep: P3 items are large; may need separate ADRs

**Mitigation**:
- Tackle P0/P1 first; validate approach before P3
- Create follow-up ADRs for P3 factories if needed

## Architecture Impact

**Principles Affected**:
- **Package Boundary Discipline** (ADR-001): Reinforced—extractions go to common
- **LLM-Optimized Strategic Reasoning** (ADR-009): Reinforced—typing and JSDoc improvements
- **Developer Experience Priority**: Reinforced—consistency and tooling

**System-Wide Changes**:
- **Packages**: common gains new exports (CodebrewPlaceholder, Router, requireAdmin, ApiContext)
- **Codebrew**: Plugin loading may become async/lazy
- **Dependencies**: None new

**Future Constraints**:
- New Codebrew placeholder UIs should use CodebrewPlaceholder from common
- New middleware should use shared Router when applicable
- Public APIs should include JSDoc for LLM consumers

## Decision Pattern

**When to Apply**:
- Adding new Codebrew placeholder routes
- Creating new middleware or routing logic
- Defining API response types used across packages
- Exposing public APIs for consumption by other packages

**When NOT to Apply**:
- Package-internal code with no cross-package use
- One-off scripts or fixtures
- Temporary debugging code

**Success Metrics**:
- Duplication: Placeholder, Router, requireAdmin extracted
- Style: oxfmt sortImports configured; oxlint sort-keys enabled and passing
- Performance: Codebrew initial bundle size measured before/after lazy loading
- Typing: ApiContext shared; no inline `import('pkg').Type` in codebrew plugins

## AI Prompts

**When Evaluating Similar Decisions**:
1. "Does this extraction respect ADR-001 package boundaries?"
2. "Would this type benefit from JSDoc for LLM consumers?"
3. "Is this duplication already covered by ADR-034 or ADR-035?"

**Pattern Recognition**:
- If adding a new Codebrew plugin with placeholder UI → use CodebrewPlaceholder from common
- If creating middleware with routing → consider shared Router from common
- If defining API response shape → add to shared types in common

**Consistency Checks**:
- Aligns with ADR-034: Implements quick wins from that ADR's analysis
- Aligns with ADR-009: Typing improvements support LLM reasoning
- Aligns with ADR-011: No inline styles in new components

## Related

- [ADR-034](./034-codebrew-package-reuse-optimization.md): Codebrew Package Reuse Optimization (parent analysis)
- [ADR-001](./001-monorepo.md): Monorepo Structure (package boundaries)
- [ADR-009](./009-llm-structure.md): LLM-Optimized Project Structure
- [ADR-032](./032-zod-api-typing.md): Zod-Based API Typing and Validation for Nonlinear
- [ADR-033](./033-zod-api-typing-expressio.md): Zod-Based API Typing and Validation for Expressio
