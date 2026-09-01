# Spark

> The engine is headless; the UI is a projection of the event stream.

[简体中文](./README.md) · English

![status](https://img.shields.io/badge/status-v1_complete-green) ![license](https://img.shields.io/badge/license-MIT-3f3f46) ![node](https://img.shields.io/badge/node-%E2%89%A5_24-3f3f46) ![react](https://img.shields.io/badge/react-19-3f3f46) ![ts](https://img.shields.io/badge/typescript-strict-3f3f46) ![monorepo](https://img.shields.io/badge/pnpm-monorepo-3f3f46)

**Spark is an Agent workbench that runs on your own machine** — your data never leaves it, four clients speak one protocol, and every step is auditable and replayable. It is built for people who want a coding agent they can understand and control: no cloud service, no account system. The engine runs the loop, tools, and approvals; the UI does exactly one thing — project the event stream into what you see.

Four core experiences:

- **Streaming conversation** — token-level delta rendering
- **Visible tool calls** — every call is a collapsible block in the session flow (diffs / terminal output)
- **Human approval** — approval cards are inlined where tools run; timeouts and errors always deny (fail-closed)
- **One protocol, four clients** — web / desktop / CLI / mobile & mini-program all render the same durable event stream

Deliberately not doing: multi-user, login, public deployment (binding to 127.0.0.1 is a design decision, not a default).

## Quick Start

```bash
# ① Install the CLI (npm package ships with v1.0.0 — see CHANGELOG; run from source before that, see "Development")
npm i -g @spark/cli

# ② One command to get a local server + TUI (the server is reaped on exit)
spark up

# ③ Configure a model (one-time, before the first turn): declare an OpenAI-compatible provider in
#    ~/.spark/models.json; API keys are injected via environment variables (never written to disk or logs):
#    { "providers": { "deepseek": { "apiKeyEnv": "DEEPSEEK_API_KEY",
#        "baseUrl": "https://api.deepseek.com/v1" } },
#      "defaultModel": { "provider": "deepseek", "model": "deepseek-chat", "contextWindow": 128000 } }
#    export DEEPSEEK_API_KEY=sk-xxx

# ④ Send the first message — write-class tools raise an approval card:
#    1 allow once / 2 always for this project / 3 always for this user / 4 deny
```

## The Four Clients

| Client            | Location                       | Form                                                                             |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Web (default)     | `apps/web`                     | React 19 workbench: session flow, approval cards, diff preview, settings center  |
| Desktop           | `apps/desktop`                 | Electron shell: sidecar reuses the same server (NSIS installer built via Actions) |
| CLI               | `apps/cli`                     | Ink 6 terminal TUI: single-column, two-line footer, one-command `spark up`        |
| Mobile            | `apps/mobile` · `apps/miniapp` | Expo+RN app and Taro 4 WeChat mini-program: pair by QR, then join the same session |

## Security Model (Summary)

- **Local-first**: binds to `127.0.0.1` by default; non-loopback binding requires pairing auth (6-digit code exchanges for a long-lived token, ADR D24). Keeping the default behavior unchanged is a hard rule.
- **Fail-closed approvals**: timeouts, errors, and interruptions always deny rather than allow; bash tools require approval by default.
- **Hard boundaries first**: path escapes are rejected before approval is even consulted; keys come only from environment variables and the local secrets store; logs and the audit stream are uniformly redacted.
- **Every step auditable**: durable events are appended to `~/.spark/sessions/` — replayable, forkable, and restorable via checkpoints.

## Architecture

```
apps/web            React 19 SPA — consumes the event stream only (applyEvent reducer)
   │  HttpTransport: REST commands + GET /api/event (single SSE endpoint, since=seq resume)
   ▼
packages/protocol   The single contract: 21 event types · zod schemas · Transport interface
   ▼
apps/server         Thin Fastify shell: REST + SSE + static hosting (127.0.0.1, no auth)
   ▼
packages/engine     InputQueue(now/steer/queue) → RunLoop → ToolPipeline
                    PermissionService (pending/cascade) · SessionManager (JSONL tree) · LlmGateway
   ▼
~/.spark/sessions/<cwd>/<ses_id>.jsonl    durable event log (append-only, replayable)
```

## Tech Stack

| Layer   | Technologies                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend| Vite 7 · React 19 · TypeScript(strict) · Tailwind CSS v4 · shadcn/ui · Vercel AI Elements (copy-in) · streamdown · react-virtuoso · zustand |
| Backend | Node 24+ · `@earendil-works/pi-ai` / `pi-agent-core` · Fastify · SSE · hand-written append-only JSONL session log                            |
| Layout  | pnpm monorepo: `packages/protocol` (single contract) · `packages/engine` · `apps/server` · `apps/web` · `apps/desktop` · `apps/cli` · `apps/mobile` (Expo+RN) · `apps/miniapp` (Taro 4 mini-program); `official/` holds the product website (frontend only, outside the pnpm workspace) |

## Documentation

| Document                                                     | Contents                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [CHANGELOG.md](./CHANGELOG.md)                               | User-visible changes (Keep a Changelog) — releases and milestones                              |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                         | Contributing: environment · claiming work orders · PR checklist · release process               |
| [AGENTS.md](./AGENTS.md)                                     | AI coding-agent rules — read this first when an AI assistant enters the repo                    |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                         | Architecture overview · ADRs · backend "AI-flavored code" blacklist (§9)                        |
| [DESIGN.md](./DESIGN.md)                                     | Visual & interaction rules — desktop feel · tokens/density · "AI-generated look" blacklist (§12) · component DoD |
| [doc/01-research-report.md](./doc/01-research-report.md)     | Research archive: source-level studies of 10 reference projects + ecosystem choices             |
| [doc/02-development-plan.md](./doc/02-development-plan.md)   | Full development plan: protocol / engine / frontend / server specs + stage roadmap & work orders |
| [doc/05-completion-audit.md](./doc/05-completion-audit.md)   | Completion audit: source-level verification · gap list G1–G7                                    |
| [doc/06-testing-plan.md](./doc/06-testing-plan.md)           | Test plan: five-layer pyramid · CI pipeline · performance baselines · walkthrough templates     |
| [doc/07-harness-audit.md](./doc/07-harness-audit.md)         | Harness audit: 19 subjects × 3 states · gaps H01–H36 · Python worker verdict                    |
| [doc/08-v2-roadmap.md](./doc/08-v2-roadmap.md)               | v2 roadmap & work-order library: stages 11–16 (release / daily-use / provable / SDK / ecosystem / command surface) |
| [.agents/skills/](./.agents/skills/)                         | Repeatable workflows: docs-update · new-event-type · new-tool · frontend-component              |

## Development

```bash
# install / typecheck / test / lint are root scripts; start each package with --filter
pnpm install
pnpm --filter server dev    # backend (tsx watch; defaults to 127.0.0.1:4318)
pnpm --filter web dev       # frontend only (VITE_SPARK_MOCK=1 runs against the in-page mock)
pnpm --filter cli dev       # CLI TUI (Ink; needs the server; --api <url>/SPARK_API to point elsewhere)
pnpm --filter mobile dev    # mobile app (Expo; needs the server, connect after pairing)
pnpm --filter miniapp dev   # WeChat mini-program (Taro 4 watch build; import dist/ in DevTools)
pnpm test / typecheck / lint
pnpm eval                   # eval regression (deterministic scenarios; --real for real-model scoring)
```

## Design Principles

- **Headless engine; the UI is a projection of the event stream** — every client talks only through the protocol
- **Protocol first, frontend first** — MockTransport lets the UI move without the backend
- **durable/live event split** — deltas are never persisted; boundary events replay
- **Failure closure + fail-closed approvals** — the event stream never dangles; errors deny instead of allow
- **Reuse open source before writing your own** — each reference project contributes a piece (see ARCHITECTURE.md ADRs)
- **Boring code, restrained UI** — both sides have "AI-flavor" blacklists (DESIGN.md §12 / ARCHITECTURE.md §9)

## Current Status

- **v1 is complete and merged to main**: five stages (skeleton / frontend / engine / deep experience / productization) + stages 6–10 (UI ZCode-mode / harness completion / CLI TUI / mobile trio / UI alignment & CLI rebuild) plus a quality-cleanup batch; the full test suite and e2e run in CI (local development runs typecheck/lint only).
- User-visible changes and milestones: [CHANGELOG.md](./CHANGELOG.md).
- Up next: stage 11 (release, doc/02 §8) → stages 12–16 ([doc/08](./doc/08-v2-roadmap.md) work-order library).

## Version History

See the Chinese edition for the full chronicle: [README.md 版本记录](./README.md#版本记录).
