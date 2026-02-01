# ADR-005: Centralized CI/CD at Monorepo Root

## Context

Initially, the monorepo was set up with individual CI/CD workflows for each package:
- `packages/common/.github/workflows/publish.yml`
- `packages/expressio/.github/workflows/trigger-workspace.yml`

This approach created several issues:
- **Duplication**: Similar workflow logic repeated across packages
- **Coordination**: Difficult to coordinate releases across packages
- **Maintenance**: Multiple workflow files to maintain and update
- **Dependencies**: Complex dependency management between package releases
- **Complexity**: Each package needed separate versioning and release logic

The project needed a simpler approach that:
- Reduced maintenance overhead
- Enabled coordinated releases
- Simplified version management
- Centralized build and deployment logic

## Decision

Remove individual package CI/CD workflows and centralize all automation at the monorepo root level.

**Changes Made:**
- Deleted `packages/common/.github/workflows/publish.yml`
- Deleted `packages/expressio/.github/workflows/trigger-workspace.yml`
- Moved `packages/expressio/.stylelintrc.js` to root level

**New Structure:**
- Single `.github/workflows/` directory at monorepo root
- Coordinated build and release processes
- Shared configuration files at root level
- Unified versioning strategy

## Consequences

### Positive
- **Simplified Maintenance**: Single set of workflow files to maintain
- **Coordinated Releases**: All packages released together with compatible versions
- **Reduced Duplication**: Shared workflow logic and configuration
- **Easier Dependencies**: No complex inter-package release coordination needed
- **Consistent Tooling**: Same linting, testing, and build processes across packages
- **Simplified Versioning**: Single source of truth for version management

### Negative
- **Granular Control**: Cannot release individual packages independently
- **Build Time**: All packages build together, potentially slower CI
- **Change Scope**: Small changes to one package trigger full monorepo build
- **Deployment Complexity**: Need to handle selective deployment if only some packages changed

## Implementation Notes

**Configuration Consolidation:**
- Moved shared config files to root (e.g., `.stylelintrc.js`)
- Each package maintains its own `package.json` for dependencies
- Root `package.json` manages workspace-level scripts and dependencies

**Release Strategy:**
- All packages share the same version number
- Releases are coordinated across the entire monorepo
- Individual packages can be published separately if needed, but versions stay in sync

## Future Considerations
- Consider selective builds based on changed packages (e.g., using `nx` or similar)
- May need to reintroduce package-specific workflows if independent release cycles become necessary
- Monitor build performance as monorepo grows
- Evaluate tools like `changesets` for more sophisticated monorepo release management

## Related Decisions
- Aligns with ADR-001 (Monorepo Structure) by treating packages as a cohesive unit
- Supports the unified development experience established in other architectural decisions