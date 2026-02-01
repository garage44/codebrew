# AI Reasoning Guide

Quick reference for using ADRs to make architectural decisions.

## Search Strategy

**By Decision Type:**
- Technology Choice → ADR-003 (Bun), ADR-010 (OxLint)
- Architecture Pattern → ADR-001 (Monorepo), ADR-004 (Preact/WebSocket)
- Design System → ADR-011, ADR-012

**By Topic:**
```bash
grep -i "websocket" docs/architecture/*.md  # ADR-004, ADR-006
grep -i "css" docs/architecture/*.md         # ADR-011, ADR-012
```

**Quick Reference:**
| Question | ADRs | Pattern |
|----------|------|---------|
| Package structure? | ADR-001 | Architecture |
| Runtime choice? | ADR-003 | Technology Adoption |
| Real-time features? | ADR-004, ADR-006 | Architecture |
| Styling approach? | ADR-011, ADR-012 | Design System |
| Tool migration? | ADR-010 | Tool Replacement |

## Pattern-Based Reasoning

1. **Identify Pattern** (from PATTERNS.md)
2. **Apply Criteria** (weighted evaluation)
3. **Check Principles** (from ARCHITECTURE.md)
4. **Reference Similar ADRs** (extract lessons)

**Example**: Evaluating new ORM
- Pattern: Technology Adoption (like ADR-003)
- Criteria: DX (9/10), Performance (8/10), Ecosystem (7/10)
- Principles: Developer Experience Priority ✅
- Reference: ADR-003 chose modern tech for DX gains

## When to Create ADR

**High Significance** (always):
- Affects multiple packages
- Introduces new pattern
- Adopts core technology
- Changes build/deployment

**Medium** (consider):
- Sets precedent
- Replaces tool/library
- Changes API patterns

**Low** (skip):
- Implementation detail
- Bug fix/refactor
- Routine dependency update

## Consistency Checks

**Core Principles** (from ARCHITECTURE.md):
- Real-time First → WebSocket default (ADR-004, ADR-006)
- Package Boundary Discipline → Domain separation (ADR-001)
- Developer Experience Priority → Fast iteration (ADR-003, ADR-010)
- Unified Design System → Shared tokens (ADR-011, ADR-012)

**Technology Stack:**
- Runtime: Bun (ADR-003)
- Frontend: Preact + DeepSignal (ADR-004)
- Communication: WebSocket-first (ADR-004, ADR-006)
- CSS: Native CSS + OKLCH (ADR-011)
- Linting: OxLint (ADR-010)

**Detect Conflicts:**
```bash
grep -i "keyword" docs/architecture/*.md  # Find related decisions
```

## Red Flags

- ⚠️ Proposing technology contradicted by ADR
- ⚠️ Violating package boundaries (ADR-001)
- ⚠️ Using different pattern without justification
- ⚠️ Skipping ADR for significant decision

## Decision Workflow

```
New Decision → Search ADRs → Found? → Follow Pattern
                              ↓ No
                         Apply Generic Pattern
                              ↓
                    Check Principles & Consistency
                              ↓
                    Implement → Document if Significant
```

## Key Files

- `ARCHITECTURE.md`: Current system state
- `index.md`: ADR index by category
- `PATTERNS.md`: Decision frameworks
- `TEMPLATE-LLM.md`: ADR template
