# ADR-035: Codebrew Plugin Architecture

---
**Metadata:**
- **ID**: ADR-035
- **Status**: Accepted
- **Date**: 2026-02-13
- **Tags**: [architecture, codebrew, plugin, expressio, pyrite, nonlinear]
- **Impact Areas**: [codebrew, common, expressio, pyrite, nonlinear]
- **Decision Type**: architecture_pattern
- **Related**: [ADR-034]
- **Supersedes**: []
- **Superseded By**: []
---

## Decision

Adopt a **simple, complete plugin architecture** for Codebrew where each app (Expressio, Nonlinear, Pyrite) registers as a plugin with a well-defined interface. Plugins declare routes, menu, API, WebSocket handlers, and optional lifecycle hooks. Codebrew provides a unified context (router, wsManager, database, config) to plugins at init time.

**Approach**: Extend the existing `CodebrewAppPlugin` interface with `basePath`, `init` lifecycle, and `PluginContext`. Plugins remain explicitly imported in `plugins.ts`—no dynamic discovery.

**Key Constraints**:
- Plugins must work both standalone (own service) and embedded (Codebrew)
- Single shared store, database, and session in Codebrew
- All plugin routes use `/{pluginId}/` prefix
- API routes use shared `/api/*` namespace (no prefix)

## Context

**Problem**: Codebrew integrates three apps with ad-hoc wiring. Expressio and Pyrite use placeholders; API/WS routes are inconsistently registered; no clear lifecycle for plugin setup. Need a simple, complete architecture that enables full integration.

**Requirements**:
- Plugins declare everything they contribute (routes, menu, API, WS)
- Plugins receive context for server-side setup (router, wsManager, database)
- Optional init hook for async setup (e.g. load config, init managers)
- Clear convention for route paths and API registration
- Presence/widget slots for always-visible UI (e.g. Pyrite presence)

## Plugin Interface

```typescript
// packages/common/lib/codebrew-registry.ts

interface CodebrewRoute {
  path: string      // Must start with /{pluginId}/
  component: ComponentType
  default?: boolean
}

interface PluginContext {
  router: ApiRouter
  wsManager: WebSocketServerManager
  database: Database
  config: Record<string, unknown>
  logger: Logger
}

interface CodebrewAppPlugin {
  id: 'expressio' | 'nonlinear' | 'pyrite'
  name: string
  icon: string
  basePath: string   // e.g. '/nonlinear' - all routes and menu hrefs use this prefix

  // Navigation
  menuItems?: Array<{ href: string; icon: string; text: string }>
  menuComponent?: ComponentType

  // Content
  routes: CodebrewRoute[]

  // Global UI (always visible when provided)
  presenceWidget?: ComponentType

  // Backend - called with context
  init?: (ctx: PluginContext) => void | Promise<void>
  apiRoutes?: (router: ApiRouter) => void
  wsRoutes?: (wsManager: WebSocketServerManager) => void
}
```

## Conventions

| Convention | Rule | Example |
|------------|------|---------|
| **Route paths** | `{basePath}/...` | `/nonlinear/board`, `/expressio/translations` |
| **Menu hrefs** | `{basePath}/...` | `/nonlinear/docs`, `/pyrite/settings` |
| **API paths** | `/api/*` (no prefix) | `/api/tickets`, `/api/workspaces` |
| **WS paths** | Plugin-defined | `/api/presence/:groupId/join` |
| **defaultRoute** | `{basePath}/...` | `/nonlinear/board` |

## Lifecycle

1. **Load** - Codebrew imports `plugins.ts` → each plugin's module runs `registerApp(plugin)`
2. **Server init** - Codebrew service starts: `initDatabase` → `service.init` → `initMiddleware`
3. **Plugin init** - For each plugin: if `plugin.init`, call `await plugin.init(context)`
4. **API/WS registration** - For each plugin: call `plugin.apiRoutes(router)`, `plugin.wsRoutes(wsManager)`
5. **Frontend** - Codebrew app loads plugins (side-effect import) → `getApps()` returns registered plugins → Main renders routes and menu

## Plugin Context

Provided to `plugin.init(context)`:

- **router** - HTTP router for `/api/*` routes (GET, POST, PUT, DELETE)
- **database** - Shared SQLite database (codebrew.db)
- **config** - Codebrew rc config (plugins can use `config[pluginId]` for plugin-specific keys)
- **logger** - Service logger

Note: WebSocket setup is done in `wsRoutes(wsManager)` which is called separately after wsManager is created.

## File Structure

```
packages/
├── codebrew/
│   ├── lib/
│   │   ├── plugins.ts       # Import and load all plugins (side-effect)
│   │   ├── plugin-context.ts # createPluginContext()
│   │   └── middleware.ts    # Calls plugin.apiRoutes, plugin.init
│   └── service.ts           # Calls plugin.wsRoutes, plugin.init
├── common/
│   └── lib/
│       └── codebrew-registry.ts  # Plugin interface, registerApp, getApps
├── expressio/
│   └── codebrew.tsx         # registerApp({ id, routes, apiRoutes, ... })
├── nonlinear/
│   └── codebrew.tsx
└── pyrite/
    └── codebrew.tsx
```

## Implementation

**Files to create**:
- `packages/codebrew/lib/plugin-context.ts` - Build PluginContext from runtime

**Files to modify**:
- `packages/common/lib/codebrew-registry.ts` - Add basePath, PluginContext, init
- `packages/codebrew/lib/middleware.ts` - Call plugin.init before apiRoutes
- `packages/codebrew/service.ts` - Call plugin.init before wsRoutes
- Each plugin's codebrew.tsx - Add basePath, use init if needed

## Consequences

**Positive**:
- Clear contract for what a plugin provides
- Init hook enables async setup (load workspaces, init managers)
- basePath convention avoids path conflicts
- Context provides everything plugins need

**Trade-offs**:
- Explicit plugin list (no auto-discovery) - simpler, no magic
- Shared database - plugins must use distinct table names (already true)
