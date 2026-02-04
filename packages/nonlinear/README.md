# Nonlinear

AI-Powered Automated Project Management

Nonlinear uses specialized AI agents to autonomously manage the complete software development lifecycle from backlog to closed tickets.

## Features

- **Automated Lifecycle**: Backlog → Todo → In Progress → Review → Closed
- **AI Agents**:
  - **Prioritizer**: Analyzes and prioritizes backlog tickets, refines descriptions, responds to @mentions
  - **Developer**: Implements tickets, creates branches/MRs, runs CI with auto-fix
  - **Reviewer**: Reviews code, provides feedback, approves or requests changes
- **Context-Aware**: Vector search across documentation and tickets for relevant context
- **Git Integration**: GitHub, GitLab, and local repositories with automatic branch/MR creation
- **Adaptive CI**: Auto-fixes linting and test issues
- **Human-in-the-Loop**: Approval gates, @mention routing, manual overrides
- **Real-time**: WebSocket updates for live Kanban board and agent status

## Architecture

Built with Bun runtime, SQLite database, Preact frontend, and Anthropic Claude API. Agents are built-in system components with direct database access, semantic search, and WebSocket-based real-time updates.

## Installation

```bash
bun install
```

## Configuration

Create a `.nonlinearrc` file in your home directory or set environment variables:

```json
{
  "anthropic": {
    "apiKey": "env:ANTHROPIC_API_KEY",
    "model": "claude-3-5-sonnet-20241022"
  },
  "git": {
    "defaultPlatform": "github",
    "github": {
      "token": "env:GITHUB_TOKEN"
    },
    "gitlab": {
      "token": "env:GITLAB_TOKEN",
      "url": "https://gitlab.com"
    }
  },
  "agents": {
    "prioritizer": {
      "enabled": true,
      "checkInterval": 300000  // Run every 5 minutes
    },
    "developer": {
      "enabled": true,
      "maxConcurrent": 3  // Up to 3 tickets simultaneously
    },
    "reviewer": {
      "enabled": true,
      "maxConcurrent": 2  // Up to 2 reviews simultaneously
    }
  },
  "ci": {
    "maxFixAttempts": 3,
    "timeout": 600000
  }
}
```

### Development Mode (No Authentication)

For development, you can bypass authentication by setting the `GARAGE44_NO_SECURITY` environment variable:

```bash
# Auto-login as admin user
GARAGE44_NO_SECURITY=1 bun run dev

# Auto-login as specific user
GARAGE44_NO_SECURITY=admin bun run dev
```

You can also override per-session using:
- Cookie: `GARAGE44_DEBUG_USER=username`
- Query parameter: `?debug_user=username`

This automatically authenticates requests and WebSocket connections without requiring login.

## Usage

### Start the service

```bash
bun run dev
```

Or in production:

```bash
bun run server
```

### Access the UI

Navigate to `http://localhost:3030` (or configured port)

### Workflow

1. Create tickets in the backlog
2. Prioritizer agent refines and prioritizes tickets (moves high-priority ≥70 to todo)
3. Developer agent picks up refined tickets, implements them, creates MRs
4. Reviewer agent reviews MRs and provides feedback
5. Humans approve closed tickets or reopen with comments
6. Use @mentions in comments to trigger agent actions

## Development

```bash
# Development mode with hot reload
bun run dev

# Build for production
bun run build

# Run linters
bun run lint:ts
bun run lint:css
```


## License

AGPL-3.0
