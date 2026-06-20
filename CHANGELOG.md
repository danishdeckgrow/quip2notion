# Changelog

All notable changes to quip2notion will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) | Versioning: [SemVer](https://semver.org/)

## [0.1.0] - 2026-06-20

### Added
- `quip2notion init` — interactive setup, creates `.env` from template
- `quip2notion plan` — Quip workspace discovery with recursive folder traversal
- `quip2notion migrate --dry-run` — simulate migration with no Notion writes
- `quip2notion migrate --execute` — perform the actual migration
- `quip2notion resume` — continue interrupted migration from last successful document
- `quip2notion verify` — spot-check migrated pages against Quip source
- `quip2notion report` — generate HTML + JSON migration report
- SQLite-backed state for idempotent, resumable migrations (`better-sqlite3`)
- HTML → Notion blocks transformer (headings, paragraphs, lists, code, callouts, dividers, images)
- Quip spreadsheet → Notion database transformer (columns, types, row values)
- HTTP allowlist enforcer — only `quip.com` and `notion.com` traffic is allowed
- Token redaction in all log output (Quip and Notion token formats)
- Exponential backoff retry on 429 / 5xx responses (up to 5 attempts)
- `p-limit` concurrency control (1–10, default 4)
- CI pipeline: lint, typecheck, test with coverage, build, npm audit, license check
- Release workflow: publish to npm + create GitHub release on tag push
