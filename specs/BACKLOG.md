# Backlog

Open work for future sessions. The orchestrator should read this at session start and offer the top open item. Tick items when done; move finished items to "Done" with the date.

_Last updated: 2026-10-28_

## In progress

- [ ] **E2E run guard**, branch `fix/e2e-run-guard` (no commits of its own yet; its base, `feature/theme-switcher`, is merged into `main`, so the PR can target `main`). The bug note is `specs/bugs/e2e-run-guard.md`.
  - **⚠️ The code is in `stash@{0}`, not in the working tree.** On 2026-10-24 at 18:27 another Claude session stashed it ("fix/e2e-run-guard WIP: run guard + local server.js/package.json changes") and switched to `fix/shopping-list-quick`.
  - **The stash also holds the user's own unrelated changes:** the `src/server.js` deletion and `package.json` dropping `legacy:dev`. To resume:
    1. Wait until no other session is working in this folder.
    2. `git switch fix/e2e-run-guard`, then `git stash pop`.
    3. Keep `src/server.js` and `package.json` out of the guard commit.
  - **Files:** `tests/e2e/run-lock.ts` (new), `tests/e2e/global-setup.ts`, `tests/e2e/global-teardown.ts`, `.gitignore`.
  - **Review round 1: FAIL.** Fix these, then re-review:
    1. **Blocking:** Playwright deletes `test-results/` ("clear output") before the webServer and globalSetup run, so a second run still breaks the first run's traces. Check the lock at config load in `playwright.config.ts` (e.g. `assertNoLiveRun()`, allowing `process.pid`/`process.ppid` for workers), or use a per-run `outputDir`. Then re-test the overlap: run 1 must pass completely.
    2. **Blocking (accuracy):** the comment in `global-setup.ts` saying teardown runs after a busy-port abort is wrong. Teardown runs only when globalSetup was reached (e.g. it threw on the lock), not after a busy-port abort.
    3. **Minor:** create the lock atomically already filled in (write a temp file, then `linkSync`); ignore ENOENT and re-check the holder before removing a stale lock; include the lock path and "delete it if no Playwright run is active" in the error; treat `holder.pid === process.pid` as stale; say "unreadable lock" for an empty file.
  - **Root cause wording to put in the bug note:** see the reviewer's version. A second run always wiped `test-results/`. If it got past the port check, its globalSetup re-cloned the database with `DROP … WITH (FORCE)`, and its teardown dropped the shared database. Nothing reported load.
  - **Resolved:** the two tests that failed under heavy load ("privacidad, stored dark, light OS" and "Marcar como hecha") passed at normal load. They were load-related, not bugs.
  - **Still needed:** one clean full suite (173 tests) on a quiet machine with no other session running e2e. Then commit path-limited with the bug note `specs/bugs/e2e-run-guard.md` (still untracked in the working tree), and push only with the user's yes.

## Needs the user

- [ ] **Manual phone check** for the assistant (13 items, `specs/assistant-chat-polish/tasks.md` T041): iPhone Safari + VoiceOver, Android Chrome + TalkBack.
- [ ] **Delete local branch `backup/assistant-9a-before-split`** (safety copy from a commit re-split; identical tree to the branch).

- [ ] **Push `fix/e2e-run-guard` and open its PR** after the commit, with base `main`.
- [ ] **Restart Claude Code** so the new speed rules load. These are scout and size triage before grilling, sub-batches of about 300 lines, running only the affected tests while iterating plus one full run per batch, tests shown failing on purpose, and minor findings folded into the next batch. They live in `.claude/agents/*.md`, which is gitignored and local only, and in `docs/agent-workflow.md`.
- [ ] **Decide on uncommitted local changes** that have been kept out of every commit so far:
  - the deletion of `src/server.js` and `package.json` dropping the `legacy:dev` script (both currently inside `stash@{0}`, see the run guard above)
  - `.claude/`, which is gitignored; un-ignore it to share the agents with the repo

## Assistant chat (follow-ups)

- [ ] **Optional spec-change:** combined questions on a recipe page ("¿Qué lleva y cómo se hace?") currently show only Preparación (today's narrowing rule, kept by spec v1.4). Decide whether they should show both sections.
- [ ] **Stale snapshot:** `a-theme-visual` "signed in, light › cart looks as it did" fails on main because local cart data grew (1882 px vs 900). Refresh it or make the test data-independent.
- [ ] **Escape in app popups (pre-existing):** `src/components/useDismiss.ts:13` (UserMenu) and `src/components/groceries/ManualAddForm.tsx:65` don't `preventDefault` on Escape, so one Escape also closes the open assistant panel. Small bug fix.
- [ ] **Safe areas:** the app sets no `viewport-fit=cover`, so `env(safe-area-inset-*)` is 0; the REQ-15 safe-area check is weak.

## Shopping list

Findings, with file:line references: `specs/bugs/shopping-list-findings.md`.

- [ ] **Pre-existing e2e failures on main** (found 2026-10-24 reviewing #2, fail without the fix too). Serial mode skips every later test when they fail:
  - `dashboard.spec.ts:213` "the newest shopping list can be checked off": the newest list in the cloned data has 0 items, so `.home-shop .home-count` never appears. The test depends on the data.
  - `dashboard.spec.ts:91` "intake rings count the equivalents of meals marked done": gets 7, expects > 7. Probably depends on the time of day. Not stash-checked.
- [ ] **Bug fix:** the period planner overcounts days (#1). **Decision needed:** for 7 days with 2 recipes, split 4+3 or 7 each?
- [ ] **Spec-change:** the unit policy (#3, #4), and the meaning of "Entrenamiento", supplements and alternatives (#8, #9).
- [ ] **Spec-change: deleted lists vs templates (#11).** Filtering deleted lists alone would make a template load empty after its backing list is deleted. Options: A) read `reference_snapshot.items` at read time (no migration); B) copy the snapshot into the cart at load; C) store the snapshot on the cart item (migration). Also decide whether a template in the Papelera still counts.
- [ ] **Refactor:** make the "Ingredientes" catalog use the same totals as the cart (#6), and remove the dead `practical_*` code and the misleading template "snapshot" wording (#10, #11).
- [ ] **Feature (later, needs a spec):** a day-by-day meal-slot expansion to replace the `period_days` multiplier.

## Small cleanups (optional)

- [ ] `tests/e2e/theme-login.spec.ts`: remove the unused `edges` field in `lookOf` / `Look`.
- [ ] `tests/e2e/theme-audit.ts`: un-export the types `Finding`, `RunResult`, `Toolkit` and `Audit`, which have no outside users.
- [ ] `specs/theme-switcher/tasks.md` header and `checklists/ux.md` still cite spec v1.4 (the spec is v1.6; v1.5 and v1.6 were wording-only).
- [ ] Optional: in `src/lib/client/theme.ts`, after a real reveal-update failure, call `applyTheme(next)` as a fallback so the stored choice and the page agree.

## Done

- 2026-10-28: **Assistant chat polish**, `feature/assistant-chat-polish`, spec v1.8 implemented (22 REQs, US1–US5). Merged as PR #6 on 2026-10-28.

- 2026-10-23: **Theme switcher (light/dark)**, `feature/theme-switcher` (24 commits), merged as PR #1. Its visual snapshots (`tests/e2e/*-snapshots/`) are gitignored on purpose and stay local. It took about 8 h of agent time and about 2.3M subagent tokens. The retrospective led to the speed rules above.
- 2026-10-24: Speed rules added to the agent definitions and `docs/agent-workflow.md`, including small-feature limits in `verifier-spec` analyze mode.
- 2026-10-26: **Shopping cart quick fixes**, `fix/shopping-list-quick`, merged as PR #2. #2: soft-deleted recipes no longer count (restore brings them back). #5: a meal's add-ons count once, scaled by its largest option (planner 4+3 → ×4, accepted trade-off), plus the test hardening from review. Note: `specs/bugs/shopping-list-quick.md`.
- 2026-10-26: **Project docs**, `docs/agent-workflow`, merged as PR #3: `CLAUDE.md`, `CONSTITUTION.md`, `docs/agent-workflow.md`, this backlog and `specs/bugs/shopping-list-findings.md`.
