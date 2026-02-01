# ADR Decision Patterns

Reusable decision frameworks extracted from existing ADRs.

## Technology Adoption Pattern

**When**: Adopting runtime, framework, or core technology
**Examples**: ADR-003 (Bun), ADR-004 (Preact)

**Criteria** (weighted):
- Developer Experience: 9/10
- Performance: 8/10
- Ecosystem Maturity: 7/10
- Team Knowledge: 6/10
- Future Viability: 8/10
- Migration Cost: 7/10

**Key Questions**:
1. What specific problem does this solve?
2. What's the migration path if unsuitable?
3. How does this affect feature delivery?
4. Long-term maintenance implications?
5. Production case studies?

**Success Metrics**: 2-5x build improvement, positive team feedback, zero regressions

**Pitfalls**: ⚠️ Bleeding-edge without production usage, ecosystem compatibility issues, no fallback plan

## Migration Pattern

**When**: Migrating technology/pattern, modernizing systems
**Examples**: ADR-006 (REST→WebSocket), ADR-007 (Bun.serve), ADR-011 (CSS)

**Criteria**:
- Value Add: 9/10
- Risk Level: 8/10
- Effort Required: 7/10
- User Impact: 9/10
- Reversibility: 7/10

**Strategy**:
1. **Validation**: Proof-of-concept, baseline metrics
2. **Incremental**: Low-risk target, feature flag, monitor
3. **Expansion**: Parallel systems, document learnings
4. **Completion**: Remove old system, update docs

**Key Questions**: Can we run parallel? Minimum viable migration? Rollback plan?

**Pitfalls**: ⚠️ Big-bang migrations, insufficient rollback, ignoring edge cases

## Architecture Pattern

**When**: Defining structure, boundaries, communication patterns
**Examples**: ADR-001 (Monorepo), ADR-004 (Preact/WebSocket)

**Criteria**:
- Scalability: 9/10
- Maintainability: 9/10
- Boundary Clarity: 8/10
- Team Collaboration: 7/10
- Performance: 8/10
- Flexibility: 7/10

**Framework**:
1. Define Boundaries (domains, concerns, crossings)
2. Establish Communication (sync/async, data flow)
3. Consider Scale (10x growth, independent evolution)
4. Validate Principles (align with core principles)

**Key Questions**: Natural boundaries? Coupling impact? Testable in isolation?

**Pitfalls**: ⚠️ Over-architecting, misaligned boundaries, wrong optimization dimension

## Design System Pattern

**When**: Visual/UX consistency, shared components, CSS architecture
**Examples**: ADR-011 (Modern CSS), ADR-012 (Design System)

**Criteria**:
- Consistency: 10/10
- Reusability: 9/10
- Maintainability: 9/10
- Developer Experience: 8/10
- Performance: 7/10
- Accessibility: 9/10

**Framework**:
1. Define Tokens (colors, spacing, typography, components)
2. Establish Patterns (layout, forms, feedback, navigation)
3. Create Components (generic in common, project extensions)
4. Document Usage (styleguide, examples, anti-patterns)

**Key Questions**: Token location? Generic vs specific? Migration path? Accessibility?

**Pitfalls**: ⚠️ Overly generic components, tight coupling, tokens in wrong package

## Tool Replacement Pattern

**When**: Replacing dev tooling, upgrading to modern alternatives
**Example**: ADR-010 (OxLint)

**Criteria**:
- Performance: 9/10
- Feature Parity: 8/10
- Migration Cost: 7/10
- Maintenance Burden: 8/10
- Future Proofing: 7/10
- Team Impact: 6/10

**Framework**:
1. Benchmark Current (performance, pain points, features, deps)
2. Evaluate Replacement (benchmarks, feature coverage, real codebase test)
3. Calculate Migration (time, breaking changes, config conversion)
4. Validate Benefits (quantify improvements, verify features, team feedback)

**Key Questions**: Specific pain points solved? Deal-breaker missing features? Rollback risk?

**Success Metrics**: 2-10x performance, reduced dependencies/config, 100% feature coverage

**Pitfalls**: ⚠️ Performance-only focus, not testing on real codebase, underestimating migration
