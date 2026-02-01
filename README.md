# Garage44

[![License](https://img.shields.io/badge/License-Mixed-blue.svg)](#licenses) [![Bun](https://img.shields.io/badge/Powered%20by-Bun-black.svg)](https://bun.sh/)

> Modern web applications built with Bun, Preact, and DeepSignal.

Automated software development platform with AI-assisted workflows, instant hot reloading, and automated deployment. **Bunchy** provides hot module replacement. **Expressio** automates i18n translation workflows. **Nonlinear** manages project lifecycle with AI agents and provides platform documentation and deployment automation. **Pyrite** is a video conferencing frontend for Galène SFU.

## Projects

### Bunchy

Blazingly fast frontend development tool for Bun. Provides hot module replacement (HMR), live reloading, build tasks, and development tooling with minimal setup.

```bash
cd packages/bunchy
bun install
```

**License:** MIT
**Documentation:** [packages/bunchy/README.md](./packages/bunchy/README.md)


### Expressio

AI-powered i18n automation platform. Automates translation workflows using AI providers (DeepL, Claude) and exports translation runtime for frontend applications.

**🌐 Live:** [expressio.garage44.org](https://expressio.garage44.org)

```bash
bunx @garage44/expressio start
# Login: admin/admin
```

**License:** AGPLv3
**Documentation:** [packages/expressio/docs/index.md](./packages/expressio/docs/index.md)

### Nonlinear

AI-powered automated project management and platform hub. Manages complete software development lifecycle from backlog to closed tickets using AI agents (prioritizer, developer, reviewer). Also provides unified documentation, deployment automation, and AI discovery mechanisms for the entire monorepo.

**🌐 Live:** [garage44.org](https://garage44.org)

```bash
cd packages/nonlinear
bun run dev
# Configure in ~/.nonlinearrc
# Access at http://localhost:3030
```

**License:** AGPLv3
**Documentation:** [packages/nonlinear/README.md](./packages/nonlinear/README.md)

### Pyrite

Video conferencing frontend for the [Galène](https://galene.org/) SFU. Self-hosted solution with multi-party video, screen sharing, and chat.

**🌐 Live:** [pyrite.garage44.org](https://pyrite.garage44.org)

```bash
cd packages/pyrite
bun run dev
# Configure in ~/.pyriterc
```

**License:** AGPLv3
**Documentation:** [packages/pyrite/docs/index.md](./packages/pyrite/docs/index.md)


## Shared Stack

- **Runtime:** Bun
- **Backend:** Bun.serve() with WebSocket support
- **Frontend:** Preact with DeepSignal
- **Styles:** Modern CSS with native nesting
- **Build:** Bunchy (hot-reload tooling with HMR)

## Quick Start

```bash
# Install dependencies
bun install

# Start any project
cd packages/expressio && bun run dev
cd packages/nonlinear && bun run dev
cd packages/pyrite && bun run dev
```

See individual project documentation for detailed setup and configuration.

## Contact

- Website: [garage44.org](https://garage44.org)
- Email: info@garage44.org
- GitHub: [github.com/garage44](https://github.com/garage44)

---

Built by Garage44
