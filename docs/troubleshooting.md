# Troubleshooting

## Top errors and fixes

### "QUIP_TOKEN is required"
Run `quip2notion init`, then open `.env` and paste your Quip token from https://quip.com/dev/token.

### "NOTION_TOKEN is required"
Create a Notion Internal Integration at https://notion.so/my-integrations and paste the token into `.env`.

### "401 Unauthorized" from Notion
Your integration hasn't been granted access to the target page. Open the Notion page → Share → search for your integration → Invite.

### "No pending migrations found"
Run the plan step first: `quip2notion plan --folder-id <YOUR_FOLDER_ID>`

### "429 Too Many Requests"
Lower your concurrency: set `CONCURRENCY=2` in `.env` and retry.

### Migration stops mid-way
Run `quip2notion resume` — it picks up from the last successful document.

### "Blocked request to disallowed host"
A URL embedded in your Quip document triggered the safety check. File an issue with the hostname (not the full URL).

### SQLite BUSY error
Another `quip2notion` process is running. Wait for it to finish or kill it with `Ctrl+C`.

### Report shows "failed" for a spreadsheet
Quip spreadsheets with merged cells or complex formulas may fail. The original Quip document is untouched — migrate it manually via Notion's import.

### `npm install` fails on `better-sqlite3`
Install build tools: `npm install -g node-gyp` then retry. On macOS also run `xcode-select --install`.
