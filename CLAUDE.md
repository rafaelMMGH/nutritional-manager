# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal, self-hosted Next.js 15 (App Router, React 19) app that parses a nutritionist's PDF plan into a meal schedule, recipe book and shopping list, backed by PostgreSQL through Prisma 7. UI copy is in Spanish (Mexico); keep it that way.

## Commands

```bash
npm run dev                    # dev server on :3000 (usually already running; see below)
npx tsc --noEmit               # type check (there is no lint script)
npm run test:e2e               # Playwright suite (clones the DB, own next dev on :3200)
npx playwright test -g "name"  # single e2e test by title
npm run test:e2e:report        # open last HTML report
npm run db:migrate             # create + apply a migration (any schema change needs one)
npm run db:generate            # regenerate Prisma client into src/generated/prisma (gitignored; also runs on postinstall)
npm run db:import -- --replace # reload the legacy data/db.json into Postgres
```

`DATABASE_URL` lives in `.env.local`; `prisma.config.ts` loads it for the Prisma CLI.

## Working without disturbing the user's environment

- The user keeps `next dev` running on :3000 against their real data. Do not run `next build` in place: it rewrites the shared `.next`. To check a production build, copy the project to a scratch dir (symlink `node_modules`) and build there.
- The e2e suite is safe: global setup clones the DB into `<name>-e2e` (needs `psql`/`pg_dump`), runs `next dev -p 3200` with `NEXT_DIST_DIR=.next-e2e`, signs in through the login form, and drops the clone in teardown. Tests run serially (one shared DB) and any console error or failed API call fails the test.
- `@playwright/test` is pinned to 1.63.0 and `unpdf` to exactly 1.7.0 (newer versions require Node 22; this machine runs Node 20). Prisma is pinned to 7.x for the same reason.

## Architecture

**Domain over an in-memory "AppDb".** The app originally stored everything in `data/db.json`. Domain logic in `src/lib/domain/` still computes over that shape (`AppDb` in `src/lib/types.ts`: one array per collection), mutating arrays in place. Postgres is adapted to it by `src/lib/storage/store.ts`:

- `loadDb(user, collections)` loads only the listed collections, scoped to the user (via `ownedBy`, which walks parent relations for child tables), ordered by `seq`. In development the returned object is a Proxy that **throws if code touches a collection that wasn't loaded** — if you add a domain read, add the collection to the loader.
- `src/lib/domain/queries.ts` `needs` maps each query to its collections; pages and GET routes call `loadFor(user, "dashboard", "cart", ...)`.
- Writes persist only what changed: `mark(db, collections)` records array lengths before a mutation, then `insertAppended(tx, db, marks)` inserts the appended rows in parent-before-child `insertOrder`. Updates to existing rows are written explicitly with Prisma in the route.
- `toRow`/`toRecord` convert between JSON records and Prisma rows: keys the model lacks go into an `extra` JSON column, `dailyLogs.date` is a `YYYY-MM-DD` string in records.

Typical mutating route (`src/app/api/**/route.ts`): `requireSession()` → zod-parse body with a schema from `src/lib/validation/schemas.ts` → `loadFor` → `mark` → domain mutation → `prisma.$transaction(tx => insertAppended(tx, db, marks))` → `json(...)` / `badRequest(error)` from `src/lib/http/respond.ts`.

**Storage invariants** (each one caused silent data/display bugs when broken):
- Every table has a `seq` autoincrement column and every read orders by it; the UI depends on insertion order and many rows share a `created_at` millisecond.
- JSON columns are `json`, not `jsonb` — jsonb re-sorts object keys and reorders macros/equivalents in the UI.
- `src/lib/storage/pg.ts` pins the pg session to UTC; the server's default timezone would shift every timestamp.
- Deletion is soft (`deleted_at`); the Papelera (`/trash`) restores plans, recipes, lists and templates. Filter `!deleted_at` in queries.

**Auth** is a local demo: `nm_session` cookie → `sessions` table (`src/lib/http/auth.ts`). Login has no password and signs into the first user. Server Components use `getPageSession()` (`src/lib/server/session.ts`), which redirects to `/login`. `src/middleware.ts` rewrites `/` to the public landing (`/inicio`) for signed-out visitors and redirects legacy `/?view=` links.

**PDF parsing** (`src/lib/domain/pdf-plan.ts`, `extractPlanFromPdf`) is tuned to one nutritionist's two-column layout: meal name and time ("Entre 7 a 8 am") on the left, "OPCION n:" + uppercase dish title + ingredient lines on the right; "Acompañar tus X con…" lines become per-meal `add_ons`; the "MIS EQUIVALENTES" table becomes `meal.equivalents`; kcal/macros/water go to `nutrition_summary`. Upload goes through a review wizard before saving and writes a PDF copy to `data/private-pdfs`. Dry-run a new PDF with `npx tsx` against `extractPlanFromPdf` before changing the parser.

**Assistant** (`src/lib/domain/chat.ts`, `/api/rag/chat`) is rule-based keyword matching over the user's own plan/recipes/cart — no external AI calls.

**UI**: route group `src/app/(dashboard)` holds the signed-in pages inside `AppShell`; feature components live in `src/components/<feature>/` with a plain CSS file per feature, alongside Tailwind v4 and shadcn primitives in `src/components/ui`. Don't name CSS classes after Tailwind utilities (e.g. `.ring`): Tailwind v4 generates the utility for any matching class name in source. Recipe list ↔ detail navigation uses React `<ViewTransition>` (`experimental.viewTransition` in `next.config.mjs`). Motion must respect `prefers-reduced-motion`.


## Principles

Non-negotiable rules live in [`CONSTITUTION.md`](CONSTITUTION.md). verifier-spec and reviewer check them, and violations are blocking.

## Always ask

No agent or teammate performs these without the user's explicit yes:

1. Push, force-push, or delete branches
2. Add or upgrade dependencies (versions are pinned for Node 20; see above)
3. Modify CI/CD, deployment, environment, or secret files (`.env.local`)
4. Database migrations or destructive data commands (`npm run db:migrate`, `db:import -- --replace`)
5. Open PRs or post PR comments

## Spec-driven workflow

Sessions start as the `orchestrator` agent (`.claude/settings.json`). It routes each request (feature, bug fix, spec-change, refactor, investigate, review, question) and runs the matching flow; see `docs/agent-workflow.md`.

- For agents: type-check with `npx tsc --noEmit` (there is no lint script), test with `npm run test:e2e`, and never run `next build` in place.
- Specs live in `specs/<feature>/` (`spec.md`, `plan.md`, `tasks.md`, `checklists/`). Bugs in `specs/bugs/`, refactor notes in `specs/refactors/`. Templates in `specs/_templates/`. Specs are written in English; UI copy stays in Spanish (Mexico).
- Spec status: `draft → approved → planned → partial → implemented`. Approved specs change only through the spec-change route.
- Branches: `feature/<feature>`, `fix/<name>`, `refactor/<name>`. Commits reference story, task, and requirement IDs.
- To start a session as a different agent: `claude --agent <name>`.
