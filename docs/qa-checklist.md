# QA Checklist for Releases

Before tagging a release, run through this checklist against a real Quip test workspace.

## Setup
- [ ] Fresh clone, `npm install`, `npm run build`
- [ ] Delete `migration-state.db` if it exists
- [ ] `.env` filled with real Quip and Notion test tokens

## Plan command
- [ ] `quip2notion plan --folder-id <id>` completes without errors
- [ ] `plan.json` is created with at least 10 documents
- [ ] Nested sub-folders are discovered
- [ ] Documents of types: text, spreadsheet are included

## Dry-run
- [ ] `quip2notion migrate --dry-run` completes without errors
- [ ] All records in `migration-state.db` show status `success`
- [ ] No Notion pages are created (verify in Notion)
- [ ] `report.html` is generated and all rows show success

## Execute
- [ ] Reset state: delete `migration-state.db`
- [ ] `quip2notion migrate --execute` completes
- [ ] Notion pages exist under the target page
- [ ] A text document with headings renders headings in Notion correctly
- [ ] A text document with a code block renders a code block
- [ ] A spreadsheet is converted to a Notion database with correct columns
- [ ] `report.html` shows all success / some partial / 0 unexpected failures

## Resumability
- [ ] Kill migration mid-run (Ctrl+C)
- [ ] `quip2notion resume` picks up and completes without duplicating pages

## Verify
- [ ] `quip2notion verify -n 10` passes for ≥80% of sample

## Safety
- [ ] Check logs: no token strings visible (search for `QUIP` and `secret_`)
- [ ] `report.html` contains no document body content

## CI
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm audit --production` shows no high/critical vulnerabilities
- [ ] `npm publish --dry-run` succeeds
