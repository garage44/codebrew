# ADR-024: Malkovich Migration to Nonlinear

---
**Metadata:**
- **ID**: ADR-024
- **Status**: Proposed
- **Date**: 2025-01-27
- **Tags**: [infrastructure, deployment, migration, tooling]
- **Impact Areas**: [nonlinear, malkovich, deployment]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-020, ADR-021]
- **Supersedes**: [ADR-020]
- **Superseded By**: []
---

## Context

Documentation functionality was moved from malkovich to nonlinear (ADR-020). Malkovich still contains deployment automation (PR deployments, webhooks, publishing). We need to consolidate all platform functionality into nonlinear and enable AI agents to control deployments.

**Requirements:**
- Move all remaining malkovich functionality to nonlinear
- Enable agents to trigger deployments after review acceptance
- Maintain existing deployment workflows (webhooks, CLI commands)
- Remove malkovich package after migration

## Decision

Migrate all malkovich deployment functionality to nonlinear:

### 1. **Move Deployment Libraries**
- Move `lib/pr-deploy.ts`, `lib/webhook.ts`, `lib/pr-cleanup.ts`, `lib/pr-registry.ts`, `lib/health-check.ts`, `lib/publish.ts`, `lib/workspace.ts`, `lib/deploy/*` to `packages/nonlinear/lib/deploy/`
- Update references: `malkovich` → `nonlinear`, port `3032` → `3030`, `~/.malkovich` → `~/.nonlinear`

### 2. **Add Deployment API for Agents**
- Create `packages/nonlinear/api/deploy.ts` with WebSocket routes:
  - `POST /api/deploy/pr` - Trigger PR deployment
  - `GET /api/deploy/status/:prNumber` - Check deployment status
  - `POST /api/deploy/cleanup/:prNumber` - Cleanup deployment
- ReviewerAgent calls deployment API after accepting review
- No separate deployment tickets - agents deploy tickets directly

### 3. **Add CLI Commands**
- Add deployment commands to `nonlinear service.ts`: `deploy-pr`, `list-pr-deployments`, `cleanup-pr`, `cleanup-stale-prs`, `generate-systemd`, `generate-nginx`, `publish`, `init`, `rules`
- Add `/webhook` endpoint to nonlinear middleware

### 4. **Update Systemd Services**
- Rename `deploy/malkovich.service` → `deploy/nonlinear.service`
- Update `deploy/pr-cleanup.service` to use nonlinear paths

### 5. **Remove Malkovich**
- Delete `packages/malkovich/` after migration complete
- Update all references throughout codebase

## Consequences

### Positive
- **Unified Platform**: All platform functionality in nonlinear
- **Agent Control**: Agents can deploy tickets after review
- **Simplified Architecture**: One less package to maintain
- **Consistent Domain**: Nonlinear serves as platform hub

### Negative
- **Migration Effort**: One-time update of references
- **Breaking Change**: Existing malkovich deployments need updating

## Related Decisions

- [ADR-020](./020-docs.md): Malkovich Platform Documentation System - Superseded by this migration
- [ADR-021](./021-nonlinear.md): Nonlinear - AI-Powered Automated Project Management - Extends with deployment capabilities
