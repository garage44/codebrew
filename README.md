# Garage44

[![License](https://img.shields.io/badge/License-Mixed-blue.svg)](#licenses) [![Bun](https://img.shields.io/badge/Powered%20by-Bun-black.svg)](https://bun.sh/)

Monorepo packages that combine into **Codebrew** — unified platform for video conferencing, AI project management, and i18n automation. Built with Bun, Preact, DeepSignal. Real-time first, WebSocket-native.

## Codebrew

**Codebrew** is the parent platform that unifies the packages below into a cohesive suite. Each package can run independently or integrate with others through shared components and WebSocket-based real-time communication.

## Packages

- **[Expressio](https://expressio.garage44.org)** — i18n automation (DeepL/Claude)
- **[Nonlinear](https://garage44.org)** — AI project management
- **[Pyrite](https://pyrite.garage44.org)** — Video conferencing (Galène SFU)
- **[Common](./packages/common)** — Shared components & utilities (MIT)
- **[Bunchy](./packages/bunchy/README.md)** — Dev tooling (MIT)

## Stack

Bun • Bun.serve() + WebSocket • Preact + DeepSignal • Modern CSS nesting

```bash
bun install
cd packages/expressio && bun run dev
```

---

[garage44.org](https://garage44.org) • [GitHub](https://github.com/garage44)
