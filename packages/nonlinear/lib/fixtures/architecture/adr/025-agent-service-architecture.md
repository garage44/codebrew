# ADR-025: Agent Service Architecture

---
**Metadata:**
- **ID**: ADR-025
- **Status**: Proposed
- **Date**: 2025-01-27
- **Tags**: [architecture, ai, automation, nonlinear, services]
- **Impact Areas**: [nonlinear]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-021, ADR-024]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

Nonlinear's current agent system (ADR-021, ADR-024) runs agents within the main service process. Agents are auto-started via `initAgentScheduler()` when the Nonlinear service starts, and they run in the same process using interval-based polling.

**Current Architecture Limitations:**

- **Tight Coupling**: Agents start automatically with main service, blocking startup if agents fail
- **Process Isolation**: Agent crashes can affect main service stability
- **Scaling**: Cannot scale agents independently (all run in same process)
- **Resource Management**: Cannot limit resources per agent (all share same process)
- **Debugging**: Difficult to debug individual agents (all logs mixed together)
- **Dynamic Agents**: Agents identified by hardcoded types (`prioritizer`, `developer`, `reviewer`), not database IDs
- **Deployment**: Cannot deploy agents separately or restart them independently

**Requirements:**

- **Independent Operation**: Each agent runs in its own process/service
- **Background Service Mode**: Agents can run as separate background services (like the indexer)
- **CLI Foreground Mode**: Agents can run interactively via CLI for debugging
- **Dynamic Agent Support**: Agents identified by database ID, supporting future dynamic agent creation
- **Default Agent Creation**: Default agents created via fixtures (consistent with other default data)
- **Process Isolation**: Agent failures don't affect main service
- **Independent Scaling**: Each agent can be scaled/deployed independently

**Alternatives Considered:**

1. **Keep Current Architecture**: Agents run in main service process
   - ❌ Blocks main service startup
   - ❌ No process isolation
   - ❌ Cannot scale agents independently
   - ❌ Difficult to debug individual agents

2. **Thread-Based Agents**: Run agents in separate threads within same process
   - ❌ Bun doesn't have true threading (uses event loop)
   - ❌ Still shares process resources
   - ❌ Agent crashes still affect main service
   - ❌ Cannot deploy agents separately

3. **Separate Service Processes**: Each agent runs as independent process/service
   - ✅ Process isolation (crashes don't affect main service)
   - ✅ Independent scaling and deployment
   - ✅ Can run agents in foreground (CLI) or background (service)
   - ✅ Supports dynamic agent creation (agents identified by ID)
   - ✅ Better resource management per agent
   - ✅ Easier debugging (separate logs per agent)

## Decision

Refactor Nonlinear's agent system to run agents as **separate service processes**, similar to the indexing service architecture:

### 1. **Agent Service Class**

Create `AgentService` class (similar to `IndexingService`) that:

- Takes agent ID (from database) as constructor parameter
- Loads agent config (type, enabled, tools, skills) from database
- Runs agent in polling loop (similar to current scheduler logic)
- Supports graceful shutdown (SIGINT/SIGTERM)
- Provides status tracking and health monitoring

**Key Features:**
- Each service instance manages one agent (identified by database ID)
- Determines poll interval based on agent type/config
- Handles agent lifecycle (start, stop, status)
- Independent logging and error handling

### 2. **Service Entry Point**

Create `lib/agent/service.ts` as main entry point for background service:

```typescript
if (import.meta.main) {
  const agentId = process.argv[2] // Get agent ID from command line
  const service = new AgentService(agentId)

  // Initialize config, database, logger
  // Start service
  // Handle graceful shutdown
}
```

**Usage:**
```bash
# Run agent as background service
bun packages/nonlinear/lib/agent/service.ts <agent-id>
```

### 3. **CLI Commands**

Add new CLI commands to `service.ts`:

- **`agent:service`**: Run agent as background service
- **`agent:run`**: Run agent interactively in foreground (with `--interactive` flag)
- **`agent:list`**: List all available agents from database

**Usage:**
```bash
# Background service mode
bun nonlinear agent:service --agent-id okzam0eo

# Foreground CLI mode (interactive)
bun nonlinear agent:run --agent-id okzam0eo --interactive

# List agents
bun nonlinear agent:list
```

### 4. **Default Agent Creation via Fixtures**

Move default agent creation from scheduler to fixtures system:

- Add `createDefaultAgents()` function to `lib/fixtures.ts`
- Call from `initializeFixtures()` when database is empty
- Ensures agents created alongside other default data (tickets, docs)
- Consistent with existing fixture pattern

**Default Agents:**
- Prioritizer Agent (`prioritizer` type)
- Developer Agent (`developer` type)
- Reviewer Agent (`reviewer` type)

### 5. **Agent ID-Based Lookup**

Refactor agent instance management to use database ID:

- Replace `getAgent(type)` with `getAgentById(agentId: string)`
- Load agent from database by ID
- Extract agent type from database record
- Create agent instance based on type from database
- Support dynamic agent creation (any agent ID, any type)

**Benefits:**
- Supports future dynamic agent creation
- Agents can have custom configurations
- Multiple agents of same type (if needed)

### 6. **Remove Auto-Start from Main Service**

Remove `initAgentScheduler()` call from main service startup:

- Agents no longer auto-start with main service
- Main service focuses on API/WebSocket/UI
- Agents started manually via CLI or systemd service files
- Keep agent status tracking, avatars, token usage (shared state)

### 7. **Refactor Scheduler**

Convert scheduler to support single-agent operation:

- Remove `initAgentScheduler()` entirely (no longer needed)
- Remove `createDefaultAgents()` (moved to fixtures)
- Keep `runAgent()` function (used by AgentService)
- Keep `triggerAgent()` function (used by API for manual triggers)
- Remove interval-based polling (moved to AgentService)
- Remove global agent instance maps (each service manages its own agent)

## Consequences

### Positive

1. **Process Isolation**: Agent crashes don't affect main service
2. **Independent Scaling**: Each agent can run on different machines/containers
3. **Better Debugging**: Can run agents in foreground for interactive debugging
4. **Resource Management**: Can limit resources per agent process
5. **Dynamic Agents**: Supports future dynamic agent creation (agents identified by ID)
6. **Deployment Flexibility**: Can deploy/restart agents independently
7. **Cleaner Architecture**: Main service focuses on API/UI, agents are separate concerns
8. **Consistent Patterns**: Matches indexing service architecture

### Negative

1. **More Processes**: Each agent runs as separate process (increased memory usage)
2. **Process Management**: Need to manage multiple agent processes (systemd, Docker, etc.)
3. **Startup Complexity**: Agents must be started manually (not auto-start)
4. **Migration Effort**: Need to refactor existing scheduler code
5. **Service Discovery**: Need to track which agents are running (status tracking)

### Mitigation Strategies

1. **Process Management**: Use systemd service files (like indexer) for production
2. **Startup Scripts**: Create startup scripts to start all agents at once
3. **Health Monitoring**: Use existing agent status tracking to monitor agent health
4. **Resource Limits**: Use systemd/cgroups to limit resources per agent
5. **Documentation**: Document agent startup/deployment process clearly

## Implementation

### Phase 1: Move Default Agents to Fixtures

1. Add `createDefaultAgents()` to `lib/fixtures.ts`
2. Call from `initializeFixtures()` when database is empty
3. Remove `createDefaultAgents()` from `lib/agent/scheduler.ts`

### Phase 2: Create Agent Service

1. Create `AgentService` class in `lib/agent/service.ts`
2. Implement agent polling loop (similar to current scheduler)
3. Add graceful shutdown handling
4. Add status tracking

### Phase 3: Add CLI Commands

1. Add `agent:service` command (background mode)
2. Add `agent:run` command (foreground mode with interactive CLI)
3. Add `agent:list` command (list agents)
4. Update `agent:trigger` to use agent ID lookup

### Phase 4: Refactor Agent Lookup

1. Replace `getAgent(type)` with `getAgentById(agentId)` in `lib/agent/index.ts`
2. Update API routes to use `getAgentById()`
3. Update scheduler to use `getAgentById()`

### Phase 5: Remove Auto-Start

1. Remove `initAgentScheduler()` call from `service.ts`
2. Remove `initAgentScheduler()` function from `lib/agent/scheduler.ts`
3. Keep agent status tracking, avatars, token usage (shared state)

### Phase 6: Systemd Service Files (Optional)

1. Create example systemd service files for each default agent
2. Document deployment process

## Files Changed

### New Files

- `packages/nonlinear/lib/agent/service.ts` - Agent service class and entry point
- `packages/nonlinear/lib/agent/cli.ts` - CLI-specific agent runner (foreground mode)

### Modified Files

- `packages/nonlinear/service.ts` - Remove `initAgentScheduler()`, add new CLI commands
- `packages/nonlinear/lib/fixtures.ts` - Add `createDefaultAgents()` function
- `packages/nonlinear/lib/agent/scheduler.ts` - Remove `initAgentScheduler()` and `createDefaultAgents()`, keep `runAgent()` and `triggerAgent()`
- `packages/nonlinear/lib/agent/index.ts` - Replace `getAgent(type)` with `getAgentById(agentId)`
- `packages/nonlinear/api/agents.ts` - Update to use `getAgentById()` instead of type-based lookup

### Unchanged Files

- `packages/nonlinear/lib/agent/base.ts` - Agent base class (no changes)
- `packages/nonlinear/lib/agent/developer.ts` - Agent implementation (no changes)
- `packages/nonlinear/lib/agent/prioritizer.ts` - Agent implementation (no changes)
- `packages/nonlinear/lib/agent/reviewer.ts` - Agent implementation (no changes)

## Future Extensibility

This architecture supports:

- **Dynamic Agent Creation**: Create agents with any role/type via API
- **Custom Agent Configurations**: Agents can have custom tools/skills/configs
- **Per-Agent Resource Limits**: Process-level isolation enables resource limits
- **Agent Scaling**: Multiple instances of same agent type (load balancing)
- **Agent Health Monitoring**: Per-process status tracking and health checks
- **Agent Deployment**: Deploy agents independently (different machines, containers)

## References

- ADR-021: Nonlinear Agent System
- ADR-024: Agent API with Anthropic Tool Use System
- Indexing Service Architecture (`lib/indexing/service.ts`)
