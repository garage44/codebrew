# ADR-010: OxLint as ESLint Replacement for Enhanced TypeScript/React Linting

---
**Metadata:**
- **ID**: ADR-010
- **Status**: Accepted
- **Date**: 2025-01-03
- **Tags**: [tooling, performance, infrastructure, frontend, backend]
- **Impact Areas**: [expressio, pyrite, common, bunchy]
- **Decision Type**: tool_adoption
- **Related Decisions**: [ADR-003]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

Expressio's monorepo consists of TypeScript/React applications with complex linting requirements across multiple packages (expressio, bunchy, common). The project previously used basic ESLint configurations, but several challenges emerged:

- **Performance bottlenecks:** ESLint execution was slow (2-5 seconds) during development and CI
- **Dependency overhead:** Large ESLint plugin ecosystem created heavy node_modules
- **Configuration complexity:** Managing ESLint configs across packages was cumbersome
- **Limited React/TypeScript optimization:** Generic ESLint rules weren't tailored for React/Preact patterns
- **Inconsistent rule coverage:** Missing performance and accessibility rules critical for web applications

A modern linting solution was needed to:
- Dramatically improve linting performance
- Provide comprehensive TypeScript and React-specific rules
- Reduce dependency footprint
- Catch performance anti-patterns in React code
- Enforce accessibility standards
- Support modern JavaScript/TypeScript patterns

## Decision Drivers

- **Development speed:** Slow linting was impacting developer productivity
- **Code quality:** Need for React performance and accessibility rules
- **Monorepo efficiency:** Consistent, fast linting across all packages
- **TypeScript focus:** Better TypeScript rule coverage and type safety
- **Zero dependencies:** Reduce build complexity and security surface
- **Future-proofing:** Modern Rust-based tooling with active development

## Considered Alternatives

### 1. Upgrade ESLint Configuration
- **Pros:** Familiar tooling, extensive plugin ecosystem, community support
- **Cons:** Performance limitations, dependency bloat, complex configuration management
- **Verdict:** Doesn't address core performance and complexity issues

### 2. Biome (Rome successor)
- **Pros:** Fast Rust-based linter, formatting included, good TypeScript support
- **Cons:** Smaller rule set, less mature React ecosystem, formatting conflicts with existing Prettier
- **Verdict:** Less comprehensive rule coverage than needed

### 3. OxLint (Chosen)
- **Pros:**
  - **524 total rules** vs ESLint's scattered ecosystem
  - **Rust-based performance** (milliseconds vs seconds)
  - **Zero dependencies** (single binary)
  - **React/TypeScript optimized** with specific rule categories
  - **Performance rules** to catch React anti-patterns
  - **Accessibility rules** built-in
  - **SARIF support** for security scanning
  - **Auto-fixing capabilities**
- **Cons:** Newer tooling, smaller community, some experimental rules

## Decision

Replace ESLint with **OxLint** across all packages with a comprehensive rule configuration optimized for TypeScript/React development.

### Implementation Strategy

1. **Complete ESLint removal:**
   - Remove all ESLint dependencies from package.json files
   - Convert ESLint disable comments to OxLint format
   - Update all lint scripts to use `oxlint`

2. **Comprehensive rule configuration:**
   - **Correctness** (176 rules): Error level - prevents broken code
   - **Performance** (10 rules): Warn level - optimizes React performance
   - **Suspicious** (33 rules): Warn level - catches likely mistakes
   - **Pedantic** (82 rules): Warn level - enforces strict patterns
   - **Style** (149 rules): Warn level - code consistency
   - **Restriction** (66 rules): Off - avoid language feature restrictions
   - **Nursery** (8 rules): Off - experimental rules disabled

3. **Plugin activation:**
   - **react:** React/Preact specific rules
   - **jsx-a11y:** Accessibility enforcement
   - **typescript:** Enhanced TypeScript checking
   - **unicorn:** Modern JavaScript patterns
   - **import:** Import organization rules

### Key Rules Configured

**Performance (Critical for React apps):**
- `perf/no-accumulating-spread`: Prevents performance-killing spread operations
- `react-perf/jsx-no-new-*-as-prop`: Prevents re-render triggers
- `unicorn/prefer-set-has`: Efficient Set operations

**React/Preact Specific:**
- `react/exhaustive-deps`: Prevents useEffect dependency bugs
- `react/jsx-key`: Ensures proper list rendering
- `react/jsx-no-target-blank`: Security best practices

**TypeScript Enhancement:**
- `typescript/consistent-type-imports`: Organizes imports
- `typescript/prefer-as-const`: Better type inference
- `typescript/no-explicit-any`: Encourages type safety

**Accessibility:**
- `jsx-a11y/alt-text`: Image accessibility
- `jsx-a11y/click-events-have-key-events`: Keyboard navigation

## Consequences

### Positive
- **Dramatic performance improvement:** Linting time reduced from 2-5 seconds to 5-50ms (100x faster)
- **Zero dependencies:** Eliminated 50+ ESLint-related packages
- **Enhanced rule coverage:** 180+ active rules vs previous basic setup
- **React performance monitoring:** Automatically catches performance anti-patterns
- **Accessibility enforcement:** Built-in a11y rules prevent accessibility issues
- **Better TypeScript support:** More comprehensive type checking and modern patterns
- **Auto-fixing capabilities:** Many rules can automatically resolve issues
- **Parallel processing:** 4+ thread execution for optimal performance
- **SARIF output:** Security-focused rules support enterprise scanning

### Negative
- **Learning curve:** Team needs to understand OxLint-specific disable syntax
- **Newer ecosystem:** Smaller community compared to ESLint
- **Some rule limitations:** A few experimental rules disabled (nursery category)
- **Migration effort:** One-time cost to update all disable comments and configurations

## Implementation Notes

### Configuration Structure
- **Root config:** `oxlint.json` with comprehensive rule setup
- **Package scripts:** All packages use `oxlint **/*.{ts,tsx}` command
- **Disable comments:** Converted from `// eslint-disable-next-line` to `// oxlint-disable-next-line`
- **CI integration:** Existing `bun run lint:ts` commands work unchanged

### Performance Metrics
| Metric | Before (ESLint) | After (OxLint) | Improvement |
|--------|-----------------|----------------|-------------|
| Speed | 2-5 seconds | 5-50ms | 100x faster |
| Dependencies | 50+ packages | 0 packages | Zero deps |
| Rules | ~50 scattered | 180+ unified | 3x coverage |
| Threading | Single | 4+ threads | Parallel |

### Migration Results
- **11 files updated:** ESLint disable comments converted
- **4 packages migrated:** All lint scripts updated
- **Issues detected immediately:** Unused imports, parameters, performance anti-patterns
- **Zero breaking changes:** Existing workflow commands unchanged

## Decision Pattern

**Pattern Name**: Tool Replacement Pattern (Linter/Dev Tool Upgrade)

**When to Apply This Pattern:**
- Current tool significantly slower than alternatives
- Tool ecosystem creates dependency bloat
- Modern alternatives offer better rule coverage
- Performance impacts developer productivity
- New tool aligns with modern tech stack decisions

**When NOT to Apply:**
- Current tool meets all needs adequately
- New tool lacks critical features
- Team heavily invested in current tool ecosystem
- Migration cost outweighs performance gains
- Stability more important than speed

**Key Questions to Ask:**
1. What specific pain points does the new tool solve?
2. Does the new tool cover all rules we currently use?
3. What's the performance improvement (target: 2-10x)?
4. What's the migration effort and risk?
5. Can we validate on real codebase before committing?
6. Does this simplify or complicate our toolchain?

**Decision Criteria:**
- **Performance**: 10/10 - 100x faster (5-50ms vs 2-5s)
- **Rule Coverage**: 9/10 - 180+ rules vs ~50 scattered
- **Dependency Reduction**: 10/10 - Zero deps vs 50+ packages
- **TypeScript/React Support**: 10/10 - Purpose-built for TS/React
- **Migration Effort**: 8/10 - Straightforward, ~11 files updated
- **Ecosystem Maturity**: 7/10 - Newer but actively developed

**Success Metrics:**
- Speed improvement: Target 10-100x faster
- Rule coverage: Match or exceed current rules
- Zero regressions: No functionality lost
- Team adoption: Positive developer feedback
- Dependency reduction: Measurable package count decrease

## Rationale Chain

**Primary Reasoning:**
1. ESLint execution slow (2-5s) during development
2. Slow linting disrupts flow state and reduces productivity
3. OxLint built in Rust, inherently faster than JavaScript-based tools
4. Rust-based tooling aligns with ADR-003's modern tooling pattern (Bun also Rust-based)
5. 100x performance improvement eliminates linting as friction point
6. Better TypeScript/React rules improve code quality
7. Zero dependencies reduces security surface and build complexity

**Tool Evaluation Process:**
1. **Benchmark current tool**: Measure ESLint performance (2-5s)
2. **Research alternatives**: OxLint, Biome, Rome (dead project)
3. **Test on real codebase**: Not samples - actual monorepo code
4. **Verify feature parity**: 180+ rules including React performance rules
5. **Measure improvement**: 100x faster (5-50ms)
6. **Validate workflow**: Existing commands still work

**Alternative Tools Rejected:**
- **Keep ESLint**: Doesn't address performance or complexity issues
- **Biome**: Smaller rule set, less mature React ecosystem
- **Rome**: Project discontinued, not viable
- **Custom tool**: Too much effort, maintenance burden

**Trade-off Analysis:**
- **Accepted Risk**: Newer tool, smaller community than ESLint
- **Gained Benefit**: 100x faster, better rules, zero dependencies
- **Reasoning**: Performance impact outweighs ecosystem maturity concerns
- **Mitigation**: Can revert to ESLint if critical issues emerge

**Assumptions:**
- OxLint stability sufficient for development use (validated: works well)
- Rule coverage adequate for needs (validated: 180+ rules exceed requirements)
- Migration straightforward (validated: 11 files, minimal changes)
- Performance gains real in monorepo (validated: 100x faster confirmed)

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Is the performance improvement significant enough (10x+ target)?"
2. "Does this align with ADR-003's modern Rust-based tooling pattern?"
3. "Have we validated feature parity on real code, not samples?"
4. "What's the dependency reduction impact?"
5. "Can we measure developer productivity improvement?"

**Pattern Recognition Cues:**
- If tool execution time impacts developer flow, investigate alternatives
- If modern Rust-based alternatives exist, evaluate them
- If dependency count is concerning, look for zero-dependency alternatives
- If complaining about tool slowness is common, benchmark and compare

**Red Flags:**
- ⚠️ Adopting tool without testing on real codebase
- ⚠️ Ignoring missing critical features
- ⚠️ Not benchmarking actual performance improvements
- ⚠️ Skipping team feedback and adoption validation
- ⚠️ Not documenting configuration migration path

**Consistency Checks:**
- Does this follow ADR-003's modern tooling adoption pattern?
- Does this simplify toolchain (fewer dependencies)?
- Does this improve developer experience?
- Have we validated performance claims?
- Is this compatible with Bun workspace structure?

## Architectural Implications

**Core Principles Affected:**
- **Developer Experience Priority**: Strongly reinforced - 100x faster linting eliminates friction
- **Package Boundary Discipline**: Supported - Better linting helps enforce boundaries
- **Real-time First**: Indirectly supported - Fast feedback loops matter

**System-Wide Impact:**
- **Development Workflow**: Linting now instant, no noticeable delay
- **CI/CD Pipeline**: Faster builds with instant linting step
- **Dependency Management**: Removed 50+ ESLint-related packages
- **Code Quality**: Better rule coverage catches more issues
- **Monorepo**: Parallel linting across packages

**Coupling Changes:**
- Removed coupling to ESLint plugin ecosystem
- Removed coupling to 50+ dependencies
- Added coupling to OxLint (single binary, acceptable)
- Simplified overall coupling model

**Future Constraints:**
- Comments use `oxlint-disable` syntax (not `eslint-disable`)
- Some experimental rules unavailable (nursery category disabled)
- Rust-based tool dependency (acceptable given Bun also Rust)
- Enables: Instant linting feedback during development
- Enables: Pattern of adopting Rust-based dev tools
- Constrains: Must use OxLint-compatible disable syntax

## References
- [OxLint Official Documentation](https://oxc.rs/docs/guide/usage/linter/rules.html)
- [ADR-003: Bun Runtime Adoption](./003-bun.md) - Related modern tooling adoption
- [ADR-004: Preact WebSocket Architecture](./004-preact-ws.md) - React/Preact patterns this linting supports

---

**Pattern**: This decision exemplifies the Tool Replacement Pattern - replacing slower legacy tool (ESLint) with modern Rust-based alternative (OxLint) for dramatic performance improvement (100x), dependency reduction (50+ to 0), and better rule coverage. Validates modern tooling adoption pattern from ADR-003.