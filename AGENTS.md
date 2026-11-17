# Repository Guidelines

## Project Structure & Module Organization

Xboard is a pnpm TypeScript monorepo. The former PHP implementation is available only in Git history.

- `apps/api/src/modules/`: NestJS feature modules; shared infrastructure lives in `common/` and `database/`.
- `apps/api/prisma/`: database schema and versioned migrations; `apps/api/test/` contains backend tests.
- `apps/user/src/`: React frontend adapted from shadcn-admin. File-based routes live in `routes/` (the router plugin regenerates `routeTree.gen.ts`; commit it), pages in `features/`, shadcn/ui components in `components/ui/`, shared layout and data-table pieces in `components/`, and API hooks in `api/`. Static assets live in `apps/user/public/`.
- `packages/api-client/`: OpenAPI specification, generated types, and client exports.
- `ops/` and `docs/`: deployment configuration and operational guides. Read `ARCHITECTURE.md` for business rules.

## Build, Test, and Development Commands

Use Node.js 24 (supported range: `>=22.12 <26`), pnpm 11.0.3, and PostgreSQL. Run commands from the repository root.

- `pnpm install`: install workspace dependencies.
- `docker compose -f compose.typescript.yaml up -d`: start local PostgreSQL and Mailpit.
- Copy `apps/api/.env.example` to `apps/api/.env` only if absent; configure `DATABASE_URL`.
- `pnpm db:setup`: generate Prisma Client and apply migrations.
- `pnpm dev`: start API and frontend development servers; frontend uses port 5173.
- `pnpm api:generate`: regenerate OpenAPI and client types after API changes.
- `pnpm typecheck`, `pnpm test`, `pnpm build`: check types, run both test suites, and build both applications.
- `pnpm format:check` / `pnpm format`: check or apply Prettier formatting.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF, final newline, four-space indentation; YAML uses two spaces. Use strict TypeScript, double quotes, and semicolons in application code. Name React components in PascalCase and frontend files in kebab-case, following the shadcn-admin layout (`features/admin/users.tsx`); use NestJS suffixes such as `auth.service.ts`, `auth.controller.ts`, and `auth.dto.ts`. Regenerate client schemas instead of editing generated types manually.

## Testing Guidelines

Backend tests use Node's test runner in `apps/api/test/*.test.ts`; frontend tests use Vitest, colocated as `*.test.ts`. Integration tests require PostgreSQL and create an isolated random schema using `TEST_DATABASE_URL` or `DATABASE_URL`. Add regression tests for changed behavior, especially authorization, payments, and node reporting. No numeric coverage threshold is configured. Before submitting, run the CI sequence: API generation, typecheck, tests, and build.

## Commit & Pull Request Guidelines

History uses Conventional Commit prefixes, including `fix(auth): ...` and `chore: ...`. Keep commits focused. PRs should explain behavior changes, link relevant issues, report validation, and include screenshots for UI changes. Describe migrations and configuration changes explicitly.

## Security & Configuration

Keep credentials and local database files out of commits. Preserve existing `.env` settings. External payments are intentionally disabled; consult `ARCHITECTURE.md` before changing financial behavior.
