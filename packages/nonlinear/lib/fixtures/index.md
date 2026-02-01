# Malkovich

Platform documentation and deployment tool for the Garage44 monorepo. Provides unified documentation hub, component styleguide, and automated PR deployment system.

**🌐 Live:** [garage44.org](https://garage44.org)

## Overview

Malkovich serves as the central platform for:

- **Documentation Hub**: Unified entry point for project documentation, ADRs, and development rules
- **Component Styleguide**: Interactive showcase of design system components
- **PR Deployments**: Automated preview environments for pull requests
- **AI Discovery**: Standard mechanism for AI agents to discover and access project documentation

## Documentation Structure

- **[ADRs](./adr/index.md)**: Architecture Decision Records documenting key architectural decisions
- **[Rules](./rules/index.mdc)**: Cursor AI rules for frontend and backend development
- **Project Docs**: Auto-discovered documentation from workspace packages

## Quick Start

```bash
# Start development server
cd packages/malkovich
bun run dev

# Access at http://localhost:3032
```

## Features

### Documentation System

- Auto-discovers package documentation from `packages/*/docs/` directories
- Client-side markdown rendering with syntax highlighting
- Hierarchical navigation with nested submenus
- Real-time updates via WebSocket

### Component Styleguide

- Interactive component examples
- Design token documentation
- Live code previews
- Responsive design showcase

### PR Deployment Automation

- One-command PR deployments
- Automatic cleanup after PR closure
- Isolated environments per PR
- Systemd and nginx configuration generation

## Architecture

Built with the same modern stack as other Garage44 applications:

- **Runtime**: Bun
- **Frontend**: Preact with DeepSignal
- **Backend**: Bun.serve() with WebSocket support
- **Build**: Bunchy (hot-reload tooling)

## License

MIT
