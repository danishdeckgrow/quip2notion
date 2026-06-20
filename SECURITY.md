# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Threat Model

quip2notion handles two sensitive secrets: a Quip personal access token and a Notion internal integration token. Here is how we protect them:

### What we do

1. **Tokens are read from environment variables only.** Never from command-line arguments (which appear in process lists) or config files committed to git.
2. **Tokens are never logged.** The logger scrubs any string matching the Quip token format (`QUIP...`) or Notion token formats (`secret_...`, `ntn_...`).
3. **HTTP allowlist.** Every outbound HTTP call is checked against an allowlist before it is made. Allowed hosts: `platform.quip.com`, `quip.com`, `api.notion.com`, and Notion's S3 upload URLs. Any other destination aborts with an error — see [`src/safety/index.ts`](src/safety/index.ts).
4. **No telemetry, no analytics, no crash reporting.** Zero third-party network calls are made by this tool.
5. **Local state only.** `migration-state.db`, `plan.json`, `report.html`, and `report.json` are written to your current directory only.
6. **`.gitignore` includes `.env`.** The init command warns if a `.env` file is detected inside a git directory.

### What you should do

- Store `.env` outside of any git-tracked directory, or ensure `.gitignore` includes `.env` before running.
- Rotate your Quip and Notion tokens if you believe they were exposed.
- Review `src/safety/index.ts` to verify the allowlist yourself.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Email **danish@deckgrow.com** with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge within 48 hours and aim to patch within 7 days.

**Please do not include your actual API tokens in the report.**
