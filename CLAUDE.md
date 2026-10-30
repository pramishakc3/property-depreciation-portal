# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## What this is

A portal for a quantity surveying business: customers request tax depreciation reports, staff move each job through a workflow, and surveyors build Division 40 / Division 43 depreciation schedules.

## Layout

- `packages/shared` contains the API contracts (Zod schemas and types) and the depreciation engine. Both the API and the web app import from `@pdp/shared`.
- `apps/api` is Express 5 with PostgreSQL (`pg`, raw parameterised SQL). Routes are in `src/routes`, and migrations are in `migrations/*.sql`.
- `apps/web` is React 19 with Vite and React Router. Pages are in `src/pages`, and `src/api.ts` wraps fetch.
- `e2e` contains Playwright tests that run against the production build.

## Commands

```bash
npm ci                     # install (use ci, the lockfile is committed)
npm run dev                # API on :4000 and web on :5173
npm run db:migrate         # apply migrations
npm run db:seed            # demo users and jobs
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e
```

Tests need PostgreSQL. `TEST_DATABASE_URL` defaults to `postgresql://postgres:postgres@localhost:5432/depreciation_test`.

## Rules

1. **Contracts first.** If a request or response changes, update the schema in `packages/shared/src/contracts.ts` first, then the API, then the web app. Never duplicate validation logic.
2. **SQL is always parameterised** (`$1`, `$2`). Never build SQL from user input with string concatenation.
3. **Migrations are append-only.** Add a new numbered file and never edit one that has been merged.
4. **Access control lives in the API.** Hiding a button in React is not security. Check roles with `requireRole`, and check job ownership with `assertCanEdit`.
5. **Secrets come from environment variables.** Never read or print `.env`, and never commit credentials.
6. **Depreciation maths changes need unit tests** in `packages/shared/src/depreciation.test.ts` with worked numbers in a comment.
7. **Audit every write** in the API with `audit()`.
8. Keep changes small and focused. Do not reformat unrelated code.

## Workflow

- Work on a branch in an isolated worktree: `git worktree add ../pdp-<topic> -b <type>/<topic>`.
- Before writing code, read the relevant files and propose a short plan.
- Before finishing, run lint, typecheck and tests, and the e2e tests if the UI or API changed. Report what you ran.
- Open a pull request with `gh pr create` using the template. Do not push to `main` and do not force-push.
- Never discard or overwrite another developer's uncommitted work.
