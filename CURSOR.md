# CURSOR.md — Semantic BI MCP

> Project brief for humans and agents. Read this before touching anything.

## What this is

A **portfolio-grade MCP server** that gives an AI assistant a safe, correct data-analyst capability over a business's metrics. The pitch in one line: *talk to your data in plain English, get answers that are always correct and can never break anything.*

It is built to win **technical clients** (founders, CTOs) via LinkedIn and direct outreach — people who know what MCP is and can tell good engineering from a wrapper. Code quality is the product; it will be read on GitHub.

**The selling service behind it:** "I'll build this against your real Postgres / BigQuery." This repo is the proof, not the product.

## The thesis (do not lose sight of this)

The naive data MCP exposes a raw SQL runner and lets the model improvise queries. It miscounts, mis-joins, ignores soft-deletes, and can mutate or leak data. **This project deliberately does the opposite:** a **semantic layer**. Every business metric is defined once, correctly, as vetted SQL, and exposed as an MCP tool. The model assembles answers from correct building blocks instead of writing SQL freehand. Guardrails (read-only, caps, PII masking, audit log) are the headline, not an afterthought.

If a change would let the model run arbitrary unvetted SQL against real tables, or could mutate data, it is wrong by definition.

## Architecture — one Next.js app, four layers

1. **MCP server** (`app/api/[transport]/route.ts`) — the deliverable. `mcp-handler` + `@modelcontextprotocol/sdk`. Exposes tools, resources, prompts over Streamable HTTP at `/api/mcp`.
2. **Data + semantic layer** (`lib/`) — `sql.js` (WASM SQLite, no native deps) holding a seeded fictional SaaS dataset ("Northwind SaaS"). Metrics defined once as vetted SQL.
3. **LangChain agent** (`app/api/chat/route.ts`) — `gpt-4o-mini` via `@langchain/openai`, connects to the **deployed** MCP server as a real network client through `@langchain/mcp-adapters`.
4. **Web chat UI** (`app/page.tsx` + `components/`) — visitors ask questions and watch each MCP tool call render live.

## Project structure

```
semantic-bi-mcp/
├─ app/
│  ├─ api/[transport]/route.ts   # MCP server -> /api/mcp
│  ├─ api/chat/route.ts          # LangChain agent, streams to browser
│  ├─ page.tsx                   # chat demo UI
│  ├─ layout.tsx
│  └─ globals.css
├─ lib/
│  ├─ db.ts                      # sql.js init + load WASM, returns a query() helper
│  ├─ seed.ts                    # creates tables + seeds Northwind SaaS with baked-in trends
│  ├─ metrics.ts                 # THE semantic layer: each metric = one vetted SQL builder
│  ├─ guards.ts                  # row caps, timeouts, PII masking, write-blocking, validation
│  ├─ audit.ts                   # in-memory audit log (the only thing we "write")
│  └─ auth.ts                    # Bearer API-key check wrapping the MCP handler
├─ components/
│  ├─ ChatWindow.tsx
│  ├─ MessageBubble.tsx
│  ├─ ToolCallCard.tsx           # renders tool name + args + result (the "wow")
│  └─ ExampleChips.tsx
├─ .cursorrules
├─ CURSOR.md                     # this file
├─ README.md
└─ .env.local
```

## Tech stack (verified June 2026)

| Area | Package / tool | Notes |
|---|---|---|
| App | Next.js (App Router), TypeScript, Tailwind | Node 20+ |
| MCP server | `mcp-handler` | Vercel's official adapter |
| MCP SDK | `@modelcontextprotocol/sdk@^1.26` | **classic** SDK; <1.26 has a security vuln; split packages stabilize Jul 28 2026 — not yet |
| Schemas | `zod@^3.25` | pin v3; SDK is v3.25+ compatible, mcp-handler expects v3 |
| Data | `sql.js` | WASM SQLite, zero native deps → serverless-safe |
| Agent bridge | `@langchain/mcp-adapters` | `MultiServerMCPClient`, `transport: "streamableHttp"` |
| Agent | `@langchain/langgraph`, `@langchain/core`, `@langchain/openai` | `createReactAgent`, `ChatOpenAI({ model: "gpt-4o-mini" })` |
| Deploy | Vercel **Pro** + Fluid compute | Hobby bans commercial use & caps maxDuration |
| Test | MCP Inspector | `npx @modelcontextprotocol/inspector` |

## Environment variables

```
OPENAI_API_KEY=...
MCP_API_KEY=<generate one>          # Bearer key the server checks
MCP_URL=https://<domain>/api/mcp    # agent calls the real deployed server
```

## Run locally

```bash
npm install
npm run dev
# MCP endpoint:  http://localhost:3000/api/mcp
# Inspect:       npx @modelcontextprotocol/inspector  -> connect to the URL above
```

## Conventions

- **Single source of truth for data is `lib/`.** Route handlers never contain business logic or SQL — they call `lib/metrics.ts`.
- **Every metric lives in `lib/metrics.ts` as a named, documented SQL builder.** Adding a metric = adding it here + registering a tool. Never inline metric SQL in a tool.
- **All tool inputs use tight zod schemas** — enums over free strings, min/max on numbers, required fields. No `z.any()`.
- **Every tool / resource / prompt gets a clear, human-quality description string.** Clients judge tool design by these.
- The agent connects to the MCP server **over HTTP**, never via in-process imports — that defeats the demo.
- `gpt-4o-mini`, `temperature: 0`.
- Comment the MCP wiring and the guardrail logic. Don't comment the obvious.

## Build order

Phases 0–7 (see the plan / README). Hard gate: **MCP Inspector must be green on every tool, resource, and prompt before building the agent or UI.** Most projects die because the pretty UI got built on top of a quietly broken server.

## Gotchas

- `sql.js` loads a `.wasm` file — configure `locateFile` to resolve it; on Vercel ensure the wasm is bundled/available to the function. Initialize the DB once per cold start and reuse.
- Keep the MCP server **stateless** (no SSE/Redis) — simpler and keeps requests short, which also softens Vercel function-duration limits.
- Don't mix zod v4. Pin v3.25.
- `safe_query` must reject anything that isn't a single read-only `SELECT` against whitelisted views, enforce a row cap, and return the SQL it executed.
