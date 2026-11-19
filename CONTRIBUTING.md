# Contributing to Xboard

Use Node.js 24, pnpm 11.0.3, and PostgreSQL 17. Set up the workspace using the [README](README.md). Tests use temporary PostgreSQL schemas. Point `DATABASE_URL` or `TEST_DATABASE_URL` at a development database.

Check [PLAN.md](PLAN.md) for current priorities and [AGENTS.md](AGENTS.md) for project conventions. Open a focused branch from the latest `main`. Share types in `packages/contracts` and update API documentation alongside changes to the contract. Add regression tests for behavior changes.

```bash
pnpm api:generate
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Use Conventional Commits and keep changes focused. Include migration and deployment details in the pull request. Add desktop and mobile screenshots for UI changes. Report suspected vulnerabilities through the process in [SECURITY.md](SECURITY.md).
