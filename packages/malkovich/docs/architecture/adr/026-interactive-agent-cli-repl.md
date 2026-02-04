# ADR-026: Interactive Agent CLI with REPL Mode

---
**Metadata:**
- **ID**: ADR-026
- **Status**: Proposed
- **Date**: 2025-02-04
- **Tags**: [architecture, ai, automation, nonlinear, cli, ux]
- **Impact Areas**: [nonlinear]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-021, ADR-024, ADR-025]
- **Supersedes**: []
- **Superseded By**: []
---

## Context

Nonlinear's agent system (ADR-021, ADR-024, ADR-025) supports running agents in two modes:
1. **Background service mode**: Agents run continuously, automatically processing work
2. **Interactive CLI mode**: Agents run in foreground with real-time reasoning display

**Current Interactive Mode Limitations:**

- Agents automatically execute their predefined `process()` method when started
- No way to give instructions or commands to the agent
- Cannot debug or test agents interactively
- Cannot control what the agent does in foreground mode
- Interactive mode feels like "watching" rather than "controlling"

**User Requirements:**

- Interactive mode should start idle and wait for user instructions (like Claude Code)
- User should be able to give natural language commands (e.g., "prioritize tickets", "work on ticket X")
- Agent should process instructions conversationally using tools
- Real-time reasoning display should continue to work
- Background service mode should remain unchanged (auto-processing)

**Inspiration:**

- **Claude Code**: Interactive REPL where you give instructions and agent executes them
- **Cursor CLI**: Real-time reasoning display with user control
- **Traditional REPLs**: Command-line interfaces that wait for input

**Alternatives Considered:**

1. **Keep Current Behavior**: Interactive mode auto-executes `process()`
   - ❌ No user control
   - ❌ Cannot debug agents interactively
   - ❌ Cannot test specific scenarios
   - ❌ Poor developer experience

2. **Separate Commands**: Add new CLI commands for each action (e.g., `agent:prioritize`, `agent:work-on-ticket`)
   - ❌ Too many commands to remember
   - ❌ Less flexible than natural language
   - ❌ Doesn't feel interactive

3. **REPL with Natural Language**: Interactive REPL that accepts natural language instructions
   - ✅ Flexible and intuitive
   - ✅ Similar to Claude Code experience
   - ✅ Easy to debug and test
   - ✅ Natural conversation flow

## Decision

Implement an **Interactive REPL Mode** for agents that:

### 1. **REPL Interface**

Create a readline-based REPL that:
- Starts idle, waiting for user input
- Shows agent name as prompt (e.g., `Developer> `)
- Supports command history (up/down arrows)
- Handles special commands (`help`, `exit`, `clear`)
- Processes natural language instructions

**Implementation:**
- Use Node.js `readline.createInterface()` for input handling
- Store command history in memory
- Display welcome message with agent capabilities on startup

### 2. **Instruction Processing**

Add `executeInstruction()` method to `BaseAgent` that:
- Accepts natural language instruction string
- Uses `respondWithTools()` to process instruction conversationally
- Builds agent-specific system prompt for instruction handling
- Streams reasoning in real-time
- Returns structured `AgentResponse`

**System Prompts:**

Each agent type gets a system prompt that:
- Explains agent's role and capabilities
- Lists available tools
- Instructs agent to interpret user commands
- Guides agent to use tools appropriately

**Example (Prioritizer):**
```
You are a Prioritizer agent. You help prioritize tickets in the backlog.

Available commands:
- "prioritize tickets" - Analyze and prioritize all backlog tickets
- "prioritize ticket <id>" - Prioritize a specific ticket
- "show backlog" - List all backlog tickets

You have access to tools for reading tickets, updating priorities, and moving tickets to todo.
When given an instruction, interpret it and use the appropriate tools.
```

### 3. **Mode Separation**

**Background Service Mode** (`agent:service`):
- Unchanged behavior
- Automatically calls `agent.process()` in polling loop
- No user interaction
- Runs continuously until stopped

**Interactive REPL Mode** (`agent:run --interactive`):
- Starts REPL loop
- Waits for user input
- Processes instructions via `executeInstruction()`
- Shows reasoning in real-time
- User controls what agent does

### 4. **Real-Time Reasoning Display**

Continue streaming agent reasoning:
- Use existing `setStream()` and `streamReasoning()` methods
- Display reasoning messages as agent works
- Show tool execution and results
- Format output for readability

## Consequences

### Positive

1. **Better Developer Experience**: Can debug and test agents interactively
2. **User Control**: User controls what agent does in foreground mode
3. **Flexibility**: Natural language instructions are more flexible than fixed commands
4. **Debugging**: Easy to test specific scenarios and edge cases
5. **Transparency**: See agent reasoning in real-time
6. **Familiar UX**: Similar to Claude Code, intuitive for users

### Negative

1. **Additional Complexity**: REPL interface adds code complexity
2. **Instruction Parsing**: Agent must correctly interpret natural language (may need refinement)
3. **Error Handling**: Need robust error handling for invalid instructions
4. **Testing**: Need to test REPL interface and instruction handling

### Mitigation Strategies

1. **Instruction Parsing**: Use agent's LLM capabilities to interpret instructions (already have `respondWithTools()`)
2. **Error Handling**: Provide clear error messages and help text
3. **Testing**: Test with various instruction formats and edge cases
4. **Documentation**: Document common commands and usage patterns

## Implementation

### Phase 1: Create REPL Interface

1. Create `lib/cli/repl.ts` with readline interface
2. Implement command history and prompt handling
3. Add special commands (`help`, `exit`, `clear`)

### Phase 2: Add Instruction Method

1. Add `executeInstruction()` to `BaseAgent`
2. Build agent-specific system prompts
3. Use `respondWithTools()` for instruction processing

### Phase 3: Refactor Interactive CLI

1. Update `runAgentInteractive()` to start REPL loop
2. Integrate instruction processing
3. Maintain real-time reasoning display

### Phase 4: Update CLI Command

1. Update `agent:run` command to use REPL mode
2. Keep non-interactive option for one-shot execution (if needed)
3. Update help text and documentation

## Files Changed

### New Files

- `packages/nonlinear/lib/cli/repl.ts` - REPL interface with readline support

### Modified Files

- `packages/nonlinear/lib/cli/interactive.ts` - Refactor to use REPL and `executeInstruction()`
- `packages/nonlinear/lib/agent/base.ts` - Add `executeInstruction()` method
- `packages/nonlinear/lib/agent/prioritizer.ts` - Add instruction handling system prompt
- `packages/nonlinear/lib/agent/developer.ts` - Add instruction handling system prompt
- `packages/nonlinear/lib/agent/reviewer.ts` - Add instruction handling system prompt (if needed)
- `packages/nonlinear/service.ts` - Update `agent:run` command

### Unchanged Files

- `packages/nonlinear/lib/agent/service.ts` - Background service unchanged
- `packages/nonlinear/lib/agent/scheduler.ts` - Auto-processing logic unchanged

## Usage Examples

### Interactive REPL Mode

```bash
# Start Developer agent in interactive mode
bun nonlinear agent:run -a 3rhpwvt5 -i

# REPL starts:
Developer> prioritize tickets
[Agent reasoning...]
✅ Prioritized 5 tickets, moved 2 to todo

Developer> work on ticket abc123
[Agent reasoning...]
✅ Started working on ticket abc123

Developer> show backlog
[Agent reasoning...]
📋 Backlog tickets:
  - ticket-1: Fix memory leak (priority: 8)
  - ticket-2: Add documentation (priority: 5)

Developer> exit
```

### Background Service Mode (Unchanged)

```bash
# Still auto-processes work
bun nonlinear agent:service -a j0yj7h7i
```

## Future Extensibility

This architecture supports:

- **Command Aliases**: Short commands (e.g., `p` for "prioritize tickets")
- **Multi-line Input**: Support for longer instructions
- **Context Persistence**: Remember previous instructions in conversation
- **Script Mode**: Execute instructions from file
- **Command Completion**: Tab completion for common commands

## References

- ADR-021: Nonlinear Agent System
- ADR-024: Agent API with Anthropic Tool Use System
- ADR-025: Agent Service Architecture
- Claude Code: Interactive AI coding assistant
- Cursor CLI: Real-time reasoning display
