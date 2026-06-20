# Privacy

quip2notion is a local-first tool. Here is exactly what it does with your data:

## What leaves your machine

| Destination | What is sent | Why |
|-------------|-------------|-----|
| `platform.quip.com` | Your Quip token (Authorization header) and document/folder IDs | To fetch your documents |
| `api.notion.com` | Your Notion token (Authorization header) and document content | To create pages in your Notion workspace |
| Notion S3 URLs | File attachment bytes (if attachment upload is implemented in a future version) | To upload files to Notion |

**Nothing else leaves your machine.** No analytics, no crash reporting, no telemetry.

## What stays local

- `migration-state.db` — SQLite database of which documents have been migrated
- `plan.json` — the list of documents discovered in your Quip workspace
- `report.html` / `report.json` — migration results (document titles and IDs only, no body content)
- `.env` — your tokens (never committed to git per `.gitignore`)

## How to verify

1. Read `src/safety/index.ts` — the HTTP allowlist is enforced before every outbound request.
2. Run with `LOG_LEVEL=debug` and inspect the output — no tokens will appear (the logger scrubs them).
3. Use a network proxy (e.g. mitmproxy) and verify that only `quip.com` and `notion.com` traffic is present.
