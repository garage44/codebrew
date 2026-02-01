# ADR-020: Malkovich Platform Documentation System

---
**Metadata:**
- **ID**: ADR-020
- **Status**: Accepted
- **Date**: 2025-01-27
- **Tags**: [infrastructure, documentation, tooling, ai, deployment]
- **Impact Areas**: [malkovich, all packages, deployment, documentation]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-009]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

As the Garage44 monorepo evolved, we needed a unified platform for:

1. **Documentation Hub**: Central entry point for both humans and AI agents to access project documentation, ADRs, and development rules
2. **Blueprint Concept**: A reusable application template that demonstrates the "stack" (Bun, Preact, DeepSignal, WebSocket) as a blueprint for AI-assisted development
3. **Deployment Automation**: Streamlined deployment configuration generation and management
4. **Platform Integration**: Unified webhook handling and npm publishing workflows
5. **AI Discovery**: Standard mechanism for AI agents to discover and access project documentation

The previous `styleguide` package served only as a component showcase, but we needed a more comprehensive platform tool that:
- Serves as the main domain entry point (`garage44.org`)
- Provides documentation for both humans and AI
- Auto-discovers packages from workspace
- Generates deployment configurations
- Integrates webhook and publishing workflows

## Decision

Create **Malkovich** (named after "Being John Malkovich") as a unified platform documentation and deployment tool that:

### 1. **Documentation System**
- **Self-contained documentation**: All ADRs, cursor rules, and patterns moved into `packages/malkovich/docs/`
- **Project READMEs**: Read from workspace at runtime (kept in repo root)
- **Markdown rendering**: Client-side rendering with `/api/markdown` endpoint
- **Local navigation**: Relative links converted to local routes (not GitHub URLs)
- **Auto-discovery**: Automatically discovers and links to package READMEs

### 2. **Domain Structure Convention**
- **Main domain** (`garage44.org`) → Malkovich (port 3032)
- **Subdomains** (`expressio.garage44.org`, `pyrite.garage44.org`) → Application packages
- **Auto-discovery**: Packages discovered from workspace `package.json`
- **Exclusion logic**: Malkovich and utility packages (common, bunchy) excluded from subdomain generation
- **All READMEs used**: Utility package READMEs included in documentation, but no subdomains

### 3. **AGENTS.md Discovery**
- **Standard entry point**: `AGENTS.md` file in project root (replaces deprecated `.cursorrules`)
- **Auto-generation**: `malkovich init` command creates `AGENTS.md`
- **Points to malkovich**: References `node_modules/@garage44/malkovich/docs/`
- **AI-friendly**: Machine-readable entry point for AI agents

### 4. **Workspace Auto-Discovery**
- **No config file needed**: Auto-discovers packages from workspace `package.json`
- **Filesystem-based**: Reads README files directly from filesystem (no GitHub dependency)
- **Application detection**: Automatically identifies application packages vs utilities
- **Deployment generation**: Uses discovered packages for systemd and nginx config generation

### 5. **Integrated Platform Tools**
- **Webhook integration**: GitHub webhook handler integrated into malkovich (`/webhook` endpoint)
- **Publishing integration**: NPM publishing workflow integrated (`malkovich publish` command)
- **Deployment generation**: Commands to generate systemd and nginx configs (`malkovich generate-systemd`, `malkovich generate-nginx`)
- **Domain parameter**: Domain configurable via `--domain` parameter (not hardcoded)

### 6. **Documentation Routes**
- **Home** (`/`): Renders main README.md from workspace root
- **Frontend** (`/frontend`): Renders `docs/rules/frontend.mdc`
- **Backend** (`/backend`): Renders `docs/rules/backend.mdc`
- **Dynamic routes**: Handles markdown file paths (e.g., `/packages/expressio/README.md`, `/adr/guide/PATTERNS.md`)
- **Existing routes preserved**: Components, Forms, Tokens routes maintained

## Consequences

### Positive
- **Unified Platform**: Single tool for documentation, deployment, and platform management
- **AI-Friendly**: Standard discovery mechanism via `AGENTS.md` and structured documentation
- **Self-Contained**: All documentation in malkovich package, installable in other projects
- **Auto-Discovery**: No manual configuration needed - discovers packages from workspace
- **Blueprint Value**: Demonstrates the "stack" as a reusable template for AI-assisted development
- **Deployment Automation**: Generates deployment configs automatically
- **No External Dependencies**: Filesystem-based, no GitHub API calls needed
- **Human + AI Access**: Serves both humans (web interface) and AI agents (AGENTS.md + API)

### Negative
- **Package Dependency**: Malkovich depends on `@garage44/common` for components/theme
- **Monorepo Coupling**: Tightly coupled to monorepo structure (workspace detection)
- **Documentation Location**: ADRs and rules moved from root to malkovich package
- **Migration Effort**: Existing references to styleguide need updating

### Mitigation Strategies
- **Package Dependency**: Acceptable - malkovich demonstrates the common components
- **Monorepo Coupling**: Intentional - malkovich is designed for monorepo deployments
- **Documentation Location**: Clear structure - all docs in `packages/malkovich/docs/`
- **Migration Effort**: One-time update - all references updated systematically

## Decision Pattern

**When to Apply This Pattern:**
- Creating a platform documentation tool for a monorepo
- Need for unified entry point for humans and AI agents
- Want to demonstrate architectural patterns as a "blueprint"
- Require deployment automation and platform integration
- Need self-contained, installable documentation package

**When NOT to Apply:**
- Simple single-package projects (overkill)
- Projects without monorepo structure
- When external documentation hosting is preferred
- When documentation should be separate from deployment tools

**Key Questions to Ask:**
1. Does the project need a unified documentation and deployment platform?
2. Should documentation be self-contained and installable?
3. Is auto-discovery from workspace structure valuable?
4. Do we need standard AI discovery mechanisms (AGENTS.md)?

**Decision Criteria:**
- **Unified Platform**: Weight 9/10 - Single tool for all platform needs
- **AI-Friendly**: Weight 8/10 - Standard discovery and structured docs
- **Self-Contained**: Weight 7/10 - Installable package with all docs
- **Auto-Discovery**: Weight 8/10 - No manual configuration needed
- **Deployment Automation**: Weight 7/10 - Generate configs automatically

**Success Metrics:**
- **Documentation Access**: All docs accessible via single entry point
- **AI Discovery**: AI agents can discover docs via AGENTS.md
- **Deployment Speed**: Config generation time < 1 second
- **Package Discovery**: 100% accuracy in detecting application packages

## Rationale Chain

**Primary Reasoning:**
1. We chose malkovich as unified platform because it consolidates documentation, deployment, and platform tools
2. Consolidation enables single entry point for both humans and AI agents
3. Single entry point addresses the problem of scattered documentation and tools
4. Self-contained documentation enables installable package for other projects
5. Auto-discovery eliminates manual configuration and reduces maintenance

**Alternatives Considered:**

### Alternative 1: Separate Documentation and Deployment Tools
- **Pros**: Clear separation of concerns, independent evolution
- **Cons**: Multiple entry points, harder to maintain, no unified platform
- **Rejected Because**: We need unified entry point for blueprint concept and AI discovery

### Alternative 2: GitHub-Based Documentation
- **Pros**: Always current, no deployment needed
- **Cons**: External dependency, not self-contained, requires GitHub API
- **Rejected Because**: We want self-contained, installable package with no external dependencies

### Alternative 3: Config File for Package Discovery
- **Pros**: Explicit configuration, clear package list
- **Cons**: Manual maintenance, configuration drift, extra file to manage
- **Rejected Because**: Auto-discovery from workspace is more reliable and requires no maintenance

**Trade-off Analysis:**
- **Trade-off 1**: We accepted monorepo coupling to gain auto-discovery and unified platform
- **Trade-off 2**: We sacrificed separate tools for unified platform to gain single entry point
- **Trade-off 3**: We moved documentation from root to malkovich package to gain self-contained structure

**Assumptions:**
- **Assumption 1**: Monorepo structure will remain stable - Validate by monitoring workspace changes
- **Assumption 2**: AGENTS.md will become standard for AI discovery - Validate by adoption in other projects
- **Assumption 3**: Domain parameter approach is sufficient - Validate by testing with different domains

## Code Context

**Files Created:**
- `packages/malkovich/lib/workspace.ts` - Workspace auto-discovery utilities
- `packages/malkovich/lib/webhook.ts` - GitHub webhook handler
- `packages/malkovich/lib/publish.ts` - NPM publishing workflow
- `packages/malkovich/lib/deploy/systemd.ts` - Systemd service generation
- `packages/malkovich/lib/deploy/nginx.ts` - Nginx config generation
- `packages/malkovich/lib/init.ts` - AGENTS.md generation
- `packages/malkovich/src/lib/markdown.ts` - Markdown rendering utilities
- `packages/malkovich/src/components/pages/home.tsx` - Home route component
- `packages/malkovich/src/components/pages/frontend.tsx` - Frontend docs route
- `packages/malkovich/src/components/pages/backend.tsx` - Backend docs route
- `packages/malkovich/src/components/pages/markdown.tsx` - Dynamic markdown route

**Files Modified:**
- `packages/malkovich/service.ts` - Added `/api/markdown` and `/webhook` endpoints, new commands
- `packages/malkovich/src/components/main.tsx` - Added new routes and navigation
- `packages/malkovich/package.json` - Updated name and description, added marked dependency
- `deploy/malkovich.service` - Renamed from styleguide.service, updated paths
- `deploy/nginx.conf.example` - Updated webhook endpoint to malkovich, added main domain routes

**Implementation Pattern:**
```typescript
// Workspace auto-discovery
import {findWorkspaceRoot, extractWorkspacePackages, isApplicationPackage} from './lib/workspace'

const workspaceRoot = findWorkspaceRoot() || process.cwd()
const packages = extractWorkspacePackages(workspaceRoot)
const appPackages = packages.filter(pkg => isApplicationPackage(pkg))

// Markdown API endpoint
if (pathname === '/api/markdown') {
  const filePath = params.get('path')
  const content = readFileSync(fullPath, 'utf-8')
  return new Response(JSON.stringify({ content }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

// Webhook integration
if (pathname === '/webhook') {
  return await handleWebhook(req)
}
```

**Anti-patterns to Avoid:**
```typescript
// ❌ Don't hardcode package lists:
const PACKAGES = ['expressio', 'pyrite'] // Wrong - use auto-discovery

// ✅ Do auto-discover from workspace:
const packages = extractWorkspacePackages(workspaceRoot) // Correct

// ❌ Don't use GitHub API for READMEs:
const content = await fetch(`https://api.github.com/...`) // Wrong - external dependency

// ✅ Do read from filesystem:
const content = readFileSync(fullPath, 'utf-8') // Correct - self-contained
```

**Migration Path:**
1. Rename `packages/styleguide/` to `packages/malkovich/`
2. Move `adr/` and `.cursor/rules/` to `packages/malkovich/docs/`
3. Update all references from styleguide to malkovich
4. Add `/api/markdown` endpoint and new routes
5. Integrate webhook and publish functionality
6. Add deployment generation commands
7. Create ADR-020 documenting the system

## AI Reasoning Prompts

**When Evaluating Similar Decisions:**
1. "Does this decision align with the blueprint concept of demonstrating a unified stack?"
2. "How does this compare to the auto-discovery approach in ADR-020?"
3. "What are the long-term maintenance implications of self-contained documentation?"
4. "Does this introduce external dependencies or maintain self-containment?"

**Pattern Recognition Cues:**
- If you see need for unified documentation and deployment platform, consider malkovich pattern
- If the problem involves AI discovery mechanisms, review AGENTS.md approach
- If requirements include auto-discovery, review workspace detection pattern
- If documentation should be installable, consider self-contained structure

**Red Flags:**
- ⚠️ **External Dependencies**: Adding GitHub API calls breaks self-containment
- ⚠️ **Hardcoded Lists**: Manual package lists break auto-discovery
- ⚠️ **Config Drift**: Separate config files may drift from workspace structure
- ⚠️ **Documentation Scatter**: Moving docs outside malkovich breaks self-containment

**Consistency Checks:**
- Does this align with ADR-009 (LLM-optimized project structure)?
- Does this support the blueprint concept for AI-assisted development?
- Does this maintain self-containment and avoid external dependencies?

## Architectural Implications

**Core Principles Affected:**
- **Self-Containment**: Reinforced - All documentation in malkovich package
- **Auto-Discovery**: New principle - Discover packages from workspace structure
- **Unified Platform**: New principle - Single tool for documentation and deployment
- **AI-Friendly**: Reinforced - Standard discovery via AGENTS.md

**System-Wide Impact:**
- **Package Boundaries**: Malkovich is platform tool, not application package
- **Documentation Location**: All docs moved to `packages/malkovich/docs/`
- **Deployment Structure**: Main domain → malkovich, subdomains → applications
- **Discovery Mechanism**: AGENTS.md replaces deprecated .cursorrules

**Coupling Changes:**
- Malkovich depends on `@garage44/common` for components/theme: Intentional - demonstrates common components
- All packages depend on malkovich for documentation: Acceptable - documentation is read-only
- Deployment tools integrated into malkovich: Intentional - unified platform

**Future Constraints:**
- **Monorepo Structure**: Malkovich assumes workspace structure - constrains to monorepos
- **Domain Convention**: Main domain → malkovich, subdomains → apps - standardizes deployment
- **AGENTS.md Standard**: Assumes AGENTS.md becomes standard - may need adaptation

## Related Decisions

- [ADR-009](./009-llm-structure.md): LLM-optimized project structure - Malkovich implements this pattern
- [ADR-001](./001-monorepo.md): Monorepo structure - Malkovich leverages workspace structure
- [ADR-005](./005-ci-cd.md): Centralized CI/CD - Malkovich integrates webhook handling

## References

- [Cursor AGENTS.md Documentation](https://cursor.com/docs/context/rules#agentsmd)
- Malkovich package: `packages/malkovich/`
- Deployment configs: `deploy/malkovich.service`, `deploy/nginx.conf.example`
