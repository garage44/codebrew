# ADR-008: Isomorphic Logger for Node/Bun and Browser Environments

## Context

Expressio previously used Winston and custom loggers for backend logging, but these solutions were not compatible with browser environments. As the codebase evolved, some shared utilities and modules (in `@garage44/common`) were imported by both backend (Bun/Node) and frontend (browser/Preact) code. This led to runtime errors (e.g., `process is not defined`) when Node-specific APIs were referenced in browser bundles.

A unified, isomorphic logging solution was needed to:
- Enable safe logging in both server and browser contexts
- Provide colored, readable output in both environments
- Support file logging on the server, but avoid Node APIs in the browser
- Allow shared code to use a single logger interface without environment checks

## Decision Drivers

- **Monorepo code sharing:** Many modules are used in both backend and frontend packages
- **Developer experience:** Consistent logging API and output across environments
- **Error prevention:** Avoid runtime errors from Node APIs in browser bundles
- **Modern DX:** Colored logs in browser devtools and terminal
- **Maintainability:** No need for separate logger implementations or manual environment checks

## Considered Alternatives

### 1. Node-only Logger (Winston, custom, etc.)
- **Pros:** Rich features, file output, mature ecosystem
- **Cons:** Not safe for browser, causes runtime errors, requires manual separation

### 2. Separate Loggers for Backend and Frontend
- **Pros:** Each environment gets an optimal logger
- **Cons:** Duplicated code, inconsistent API, more maintenance, error-prone imports

### 3. Isomorphic Logger (Chosen)
- **Pros:**
  - Single API for all environments
  - Auto-detects runtime and adapts
  - Safe for shared code
  - Colored output in both terminal and browser
  - File output only on server
- **Cons:** Slightly more complex implementation

## Decision / Implementation

We implemented an **isomorphic logger** in `packages/common/lib/logger.ts` with the following features:

- **Environment detection:**
  - Uses Node/Bun APIs (fs, path, process) only if running in Node/Bun
  - Uses browser-safe logging (console, CSS colors) in the browser
- **API:**
  - `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`, `logger.verbose()`
  - `setLevel()` to control verbosity
  - File output (server only)
- **Output:**
  - Colored logs in both terminal and browser devtools
  - Timestamps and log levels in all environments
  - No file output or Node APIs in the browser
- **Usage:**
  - Import and use the logger from any shared or environment-specific code
  - No more `process is not defined` or similar errors in browser

### Example Usage

**Backend (Bun/Node):**
```ts
import { Logger } from '@garage44/common/lib/logger.ts'
const logger = new Logger({ level: 'debug', file: './mylog.log' })
logger.info('Hello from backend!')
```

**Frontend (Browser/Preact):**
```ts
import { Logger } from '@garage44/common/lib/logger.ts'
const logger = new Logger({ level: 'debug' })
logger.info('Hello from browser!')
```

## Consequences

### Positive
- No more runtime errors from Node APIs in browser
- Consistent, colored logs everywhere
- File output for backend, browser-safe for frontend
- Simpler code sharing and maintenance

### Negative
- Slightly more complex logger implementation
- File logging not available in browser (by design)

## Lessons Learned
- Isomorphic utilities are essential for monorepo/shared codebases
- Always guard Node/Bun APIs when writing shared code
- Colored logs improve developer experience in both environments
- A single, adaptive logger reduces bugs and maintenance overhead

## References
- [ADR-003: Bun Runtime Adoption](./003-bun.md)
- [ADR-007: Bun.serve Migration](./007-bun-serve.md)