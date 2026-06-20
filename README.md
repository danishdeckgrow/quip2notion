# quip2notion

**Bulk-migrate your Quip workspace to Notion — local-first, privacy-safe, and resumable.**

[![CI](https://github.com/danishdeckgrow/quip2notion/actions/workflows/ci.yml/badge.svg)](https://github.com/danishdeckgrow/quip2notion/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/quip2notion.svg)](https://www.npmjs.com/package/quip2notion)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

> **Privacy promise:** Runs entirely on your machine. This tool never sends your content, tokens, or metadata anywhere except the official Quip API (`quip.com`) and the official Notion API (`api.notion.com`). [Verify in the source.](src/safety/index.ts)

---

## Why this exists

Salesforce is retiring Quip. All Quip products will be unrenewable after **March 1, 2027**. Notion has a manual import option, but it only supports one document at a time with no spreadsheet or folder structure preservation. There is no official bulk migration tool.

quip2notion closes that gap.

## Quickstart

```bash
# Install globally
npm install -g quip2notion

# 1. Create your .env file
quip2notion init

# 2. Edit .env with your tokens (see below), then discover your workspace
quip2notion plan --folder-id <YOUR_QUIP_FOLDER_ID>

# 3. Preview what would be migrated (no Notion writes)
quip2notion migrate --dry-run

# 4. Perform the actual migration
quip2notion migrate --execute
```

### Getting your tokens

| Token | Where to get it |
|-------|----------------|
| `QUIP_TOKEN` | [https://quip.com/dev/token](https://quip.com/dev/token) |
| `NOTION_TOKEN` | [https://notion.so/my-integrations](https://notion.so/my-integrations) — create an Internal Integration |
| `NOTION_TARGET_PAGE_ID` | Open any Notion page → Share → Copy link → the UUID at the end |

> **Important:** After creating your Notion integration, share the target page with it. Open the page → Share → search for your integration name → Invite.

## Feature matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Quip text documents | ✅ Full | Headings, paragraphs, lists, code blocks, dividers, callouts |
| Quip spreadsheets | ✅ Full | Converted to Notion databases; columns preserved |
| Folder hierarchy | ✅ Full | Mapped to Notion page tree |
| Images | ⚠️ Partial | External URL links; binary upload planned for v0.2 |
| File attachments | ⚠️ Partial | Links only; binary upload planned for v0.2 |
| Quip comments | ⚠️ Partial | Appended as toggle blocks; live Notion comments if permission allows |
| Formulas in spreadsheets | ⚠️ Partial | Exported as last computed value with footnote |
| Quip slides | ❌ Not migrated | Export format not publicly documented |
| Quip chat threads | ❌ Not migrated | No Notion equivalent |
| Quip mentions / permissions | ❌ Not migrated | User-specific data |

## All commands

```
quip2notion init               # Create .env from template
quip2notion plan               # Discover workspace, write plan.json
quip2notion migrate --dry-run  # Preview migration (no Notion writes)
quip2notion migrate --execute  # Perform the actual migration
quip2notion resume             # Continue interrupted migration
quip2notion verify             # Spot-check N migrated pages
quip2notion report             # Print / open latest migration report
```

Every command supports: `--config <path>`, `--verbose`, `--concurrency <n>` (1–10, default 4).

## Resumability

quip2notion stores migration state in a local SQLite database (`migration-state.db`). If a migration is interrupted (Ctrl+C, network error, rate limit), run `quip2notion resume` to pick up where it left off. Already-successful documents are never re-migrated.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `QUIP_TOKEN is required` | Run `quip2notion init` and fill in `.env` |
| `NOTION_TARGET_PAGE_ID is required` | Add the target page ID to `.env` |
| `401 Unauthorized (Notion)` | Check your token and that you shared the page with your integration |
| `429 Too Many Requests` | Reduce `CONCURRENCY=2` in `.env` and retry |
| `Blocked request to disallowed host` | A URL in your Quip content triggered the safety check — file an issue |
| `No pending migrations found` | Run `quip2notion plan --folder-id <id>` first |
| Migration stops mid-way | Run `quip2notion resume` |
| Report shows "failed" for a spreadsheet | Complex merged cells or formulas — migrate manually via Notion import |
| `npm install` fails on `better-sqlite3` | Run `npm install -g node-gyp` then retry |
| SQLite BUSY error | Another `quip2notion` process is running |

## FAQ

**Q: Does this send my data anywhere besides Quip and Notion?**
No. All processing is local. The source code is open and auditable.

**Q: Can I re-run the migration safely?**
Yes. The tool is idempotent — already-successful documents are skipped.

**Q: How do I migrate from a specific Quip folder?**
Find your Quip folder URL (e.g. `https://quip.com/ABCDEFGH`) and use: `quip2notion plan --folder-id ABCDEFGH`

**Q: How long does migration take?**
About 1 document/second at default concurrency of 4. A 1,000-document workspace takes ~15 minutes.

**Q: Is there a SaaS version?**
No, and there won't be. This tool is local-only by design.

## Architecture

See [docs/architecture.md](docs/architecture.md) for a full breakdown of modules and data flow.

## Privacy

See [docs/privacy.md](docs/privacy.md) for exactly what leaves your machine.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

## License

[MIT](LICENSE) — Danish Afridi / danishdeckgrow
