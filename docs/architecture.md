# Architecture

## Overview

quip2notion is a TypeScript CLI that orchestrates a one-way migration from Quip to Notion.

```
[Quip API] ──► [Discover] ──► [SQLite state] ──► [Transform] ──► [Notion API]
                                    │
                                 plan.json
                               report.html / report.json
```

## Modules

| Module | Purpose |
|--------|---------|
| `src/cli/` | Commander.js commands. Each is a thin wrapper that reads config and calls the core. |
| `src/quip/` | Quip API client with exponential backoff retry. Validates responses with Zod. |
| `src/notion/` | Notion SDK wrapper. Block builders for each supported Notion block type. |
| `src/transform/` | Converts Quip HTML to Notion blocks. Converts spreadsheet HTML to Notion database schemas. |
| `src/state/` | SQLite state store (better-sqlite3). Tracks per-document migration status. |
| `src/report/` | Generates `report.html` and `report.json` after each run. |
| `src/safety/` | Token redaction and HTTP allowlist enforcement. |
| `src/config.ts` | Loads and validates environment variables with Zod. |
| `src/logger.ts` | Pino logger with token redaction. |
| `src/migrator.ts` | Core engine. Reads pending records from state, transforms, writes to Notion. |

## Data flow

1. **`plan`** — walks the Quip folder tree and writes one SQLite row per document with status `pending`.
2. **`migrate --dry-run`** — reads pending rows, fetches each document, runs the transform, does not call Notion. Sets status to `success` (notionPageId = 'dry-run').
3. **`migrate --execute`** — same as dry-run but calls Notion APIs to create pages and databases. Updates state to `success` or `failed`.
4. **`resume`** — resets `in_progress` rows to `pending` (from a prior interrupted run) and re-runs migrate.
5. **`report`** — reads all state rows and generates the HTML/JSON report.

## Concurrency

`p-limit` caps concurrent in-flight API calls. Default 4, max 10. Each document is one async task; the limiter queues excess tasks.

## Retry strategy

Quip API 429 and 5xx responses trigger exponential backoff: `max(Retry-After header, 2^attempt seconds)`, up to 5 attempts.
