# Contributing to quip2notion

Thank you for considering a contribution! This project is open-source and MIT-licensed.

## How to contribute

1. **Fork** this repository and create a branch from `main`.
2. Make your changes.
3. Run `npm test` and ensure all tests pass.
4. Run `npm run typecheck` and `npm run lint`.
5. Open a pull request describing what you changed and why.

## Development setup

```bash
git clone https://github.com/danishdeckgrow/quip2notion.git
cd quip2notion
npm install
cp .env.example .env
# Fill in .env with test tokens
npm run build
npm test
```

## Code style

- TypeScript strict mode is required — no `any` without a comment explaining why.
- No `console.log` — use the `logger` from `src/logger.ts`.
- Prefer explicit error messages that tell the user what to do.
- Write no comments unless the WHY is non-obvious.

## Security rules for contributors

- **Never log tokens.** Use `redactTokens()` before logging any string that might contain one.
- **Never add a new HTTP destination** without updating `src/safety/index.ts` and documenting why.
- **Never disable the allowlist check** in tests — mock at the `undici/fetch` level instead.

## Running tests

```bash
npm test                    # Run all tests
npm run test:coverage       # Run with coverage report
```

Coverage must remain above 85%.

## Reporting a bug

Please use the [Migration Failure issue template](.github/ISSUE_TEMPLATE/migration_failure.yml). **Redact your tokens and document content before submitting.**
