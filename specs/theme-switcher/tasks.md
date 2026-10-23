# Tasks: Theme switcher (light / dark)

**Spec:** [spec.md](spec.md) (v1.4) · **Plan:** [plan.md](plan.md)

Format: `- [ ] T### [P] [US#] Description (path/to/file)`.
`[P]` = can run in parallel with other `[P]` tasks in the same phase (different files, no shared dependency).

**Order:** US1 → US4 → US2 → US3 → US5. US1, US2, US3 and US4 are all P1.
- US1 comes first because it is the mechanism every other test drives.
- US4 follows immediately. Once US1 exists, a stored or OS dark choice leaks onto the landing, so its test is red after US1 and goes green with the lock.
- US2 comes before US3, because the reveal is only reviewable with the real palette.
- US5 is P2.

**Gates:**
- D1 (Branch B), D2 (gitignore snapshots) and D3 (`/no-existe` light, spec v1.4) are recorded in plan.md (2026-10-22) before T002 and T006.
- No `src/` change before T006 (the baseline commit).

**Global rules:**
- **Commits are path-limited.** The working tree holds unrelated user changes: modified `package.json` and `next-env.d.ts`, a staged deletion of `src/server.js`, and untracked `CLAUDE.md`, `CONSTITUTION.md`, `docs/` and `specs/`. Branch creation carries them along. Never commit, revert, stash or restage them.
  - Every commit is `git add -- <listed paths>`, then `git commit -m "…" -- <listed paths>`. The pathspec form commits only those paths and leaves the staged `src/server.js` deletion out.
  - After each commit, `git show --stat HEAD` must list only the task's files.
  - Files under `specs/` are not committed unless the user asks.
- Commit messages reference the story, task and REQ IDs (CLAUDE.md).
- **REQ-11 runs** of `a-theme-visual` before T041 are advisory. Investigate diffs in regions the task touched, but only T041 is binding.
- **e2e runs are sequential.** Port 3200 and the `<db>-e2e` clone are shared, so never run two suites at once.

## Phase 1: Setup

- [x] T001 [setup] Create branch `feature/theme-switcher` from `main` (local only, no push). Do not stash or reset the dirty tree.
- [x] T002 [setup] D2: add `tests/e2e/*-snapshots/` to `.gitignore`, then commit only `.gitignore` (.gitignore).

## Phase 2: Foundational (blocks all stories)

- [x] T003 [foundational] Move the auto `issues` fixture into a shared module and import it from the existing suite, with no behavior change for it. It fails on `pageerror`, console type `"error"` and `/api/` responses ≥ 400. Warnings do not fail it. Add the opt-in `expectedIssues: RegExp[]` option (default `[]`): the list is a multiset, so each declared entry is consumed by exactly one matching issue, at most once; a matching issue beyond the declared count fails the test, and a declared entry left unconsumed fails the test. Two real consumers, both on the same mocked 500: T020's error-toast case and T021's contrast audit of that toast. Commit only these two files (tests/e2e/fixtures.ts, tests/e2e/dashboard.spec.ts).
- [x] T004 [foundational] Theme test helpers (tests/e2e/theme-helpers.ts, tests/e2e/screenshot.css). Depends on T003.
  - `seedTheme`, and `blockThemeStorage`, which wraps `Storage.prototype.getItem/setItem/removeItem` to throw only for key `nm-theme`.
  - In-page `toRgb` through a canvas, plus `contrast`, `oklch` and `effectiveBackground`.
  - `expectThemeMeta(page, theme)` checks html `color-scheme`, and that meta `theme-color` equals the computed canvas.
  - `softNavMarker` sets `window.__soft` before a click and asserts it survived.
  - The in-scope (dark) page list: home, recipes list and detail, recipe not-found (`/recipes/<missing-id>`), groceries/cart/templates, plans, trash, settings; IDs from `sql()`. `/no-existe` is NOT in it (D3).
  - The light-locked page list: signed-out `/`, `/inicio`, `/privacidad`, `/terminos`, `/no-existe`.
  - `dynamicMasks(page)`.
  - `screenshot.css` hides `nextjs-portal` (the dev indicator).
- [x] T005 [US2] REQ-11, REQ-14: light screenshot spec for every in-scope page plus the light-locked pages `/inicio`, `/privacidad`, `/terminos` and `/no-existe` (tests/e2e/a-theme-visual.spec.ts). Depends on T004.
  - Settings: `colorScheme: "light"`, `maxDiffPixelRatio: 0.01`, `stylePath: screenshot.css`.
  - Masks: dates, times, counters and `.topbar-account`.
- [x] T006 [US2] REQ-11: **capture the baseline on unchanged `main` code.**
  - Run `npx playwright test a-theme-visual --update-snapshots`, then rerun it to confirm 0 diffs.
  - Snapshots stay local (D2).
  - Commit only tests/e2e/theme-helpers.ts, tests/e2e/screenshot.css and tests/e2e/a-theme-visual.spec.ts. Record the commit SHA for T041.

**Checkpoint:** the baseline exists, so `src/` work may start.

## Phase 3: US1 (P1) Choose a theme that sticks

- [x] T007 [US1] Tests REQ-1, REQ-2, REQ-10 (switch part) (tests/e2e/theme-switch.spec.ts). All are red before T009.
  - REQ-1 at 1280 and 360 px: the switch is visible in `.topbar` and is ≥ 44×44. Its name and `title` are "Cambiar a tema oscuro/claro". It has no `aria-pressed`, and Tab + Enter/Space operate it.
  - REQ-2: toggle twice, checking `color-scheme`, canvas bg, `data-icon` and name.
  - The assistant panel stays open. A popover open while switching gives no error.
  - Forced-colors emulation: the switch is visible, focusable and toggles storage.
  - REQ-10: after each toggle, `expectThemeMeta`, and the `type="time"` input on home reports a dark `color-scheme`.
- [x] T008 [US1] Tests REQ-3, REQ-4, REQ-5, REQ-10 (OS part), REQ-16 (tests/e2e/theme-switch.spec.ts). All are red before T009/T013.
  - REQ-3: reload, new page, and sign-out/sign-in in a fresh context signed in through the form (never log out the shared session).
  - Blocked storage via `blockThemeStorage`: the page still toggles, and the test's own listener captures a `console.warn` (the `issues` fixture ignores warnings). The next load follows the OS.
  - REQ-4: the `<body>`-insertion recorder sees the same `color-scheme` before and after hydration.
  - REQ-5: OS default, a live OS flip with a dialog/assistant open, and a stored choice that ignores the OS.
  - REQ-10: after the live OS flip, `expectThemeMeta`.
  - REQ-16: dark + `emulateMedia({media:"print"})`. Canvas and body text equal the light values, and html `color-scheme` is `light`.
- [x] T009 [US1] Constants (`nm-theme`, `THEME_COLORS`, lock attr) and `themeInitScript` (src/lib/theme.ts).
  - The script sets `html.dark`, the inline `color-scheme` and a created `meta[name=theme-color]`.
  - It uses `getItem` only. Storage errors become a `console.warn`.
- [x] T010 [US1] Runtime (src/lib/client/theme.ts). Depends on T009.
  - `getTheme`, and `setTheme`, which stores with try/catch + warn and applies class/scheme/meta.
  - `useTheme`, using `useSyncExternalStore` + `MutationObserver`, with an OS listener that reapplies class/scheme/meta when nothing is stored.
  - An instant-only `switchTheme(next, trigger?)`.
- [x] T011 [US1] Root layout (src/app/layout.tsx, src/components/app/ThemeRuntime.tsx). Depends on T009, T010.
  - `<head>` gets the inline script, and `<html>` gets `suppressHydrationWarning`.
  - `ThemeRuntime` replaces `<Toaster>` and renders it with `theme` from `useTheme`. The soft-nav sync is added in T018.
- [x] T012 [US1] `ThemeToggle`, one component with no wrapper (src/components/app/ThemeToggle.tsx, src/components/app/AppShell.tsx, src/components/app/shell.css). Depends on T010.
  - A `<button type="button">` with stacked lucide `Sun`/`Moon` and `data-icon`. `aria-label` and `title` come from `useTheme`. `onClick` calls `switchTheme(next)`.
  - An opacity-only crossfade with no transform; `transition: none` under reduced motion.
  - 44×44, with a forced-colors rule. Placed inside `.topbar-account` at all widths.
- [x] T013 [US1] Minimal dark tokens in globals.css (src/app/globals.css).
  - Replace the neutral `.dark` with `@media screen { html.dark { color-scheme: dark; --canvas; --surface; --text-1..3; shadcn --background/--foreground } }`.
  - Add `@media print { html { color-scheme: light !important } }`.
  - Redefine `@custom-variant dark` to the screen-scoped selector.
  - `THEME_COLORS.dark` must equal `--canvas`.
- [x] T014 [US1] Verify, then commit.
  - Run `npx tsc --noEmit`, `npx playwright test theme-switch` and `npm run test:e2e`. The `a-theme-visual` run is advisory.
  - Commit the T007 to T013 files as two path-limited commits: tests (T007/T008) and mechanism (T009 to T013).

**Checkpoint:** US1 is complete (REQ-1 to REQ-5, REQ-10 mechanism, REQ-16). Do not ship it alone, because the public pages are not yet locked.

## Phase 4: US4 (P1) Public pages stay light

- [x] T015 [US4] Tests REQ-14 + soft navigation (tests/e2e/theme-public.spec.ts). Red after US1.
  - Stored dark, and OS dark with nothing stored: every light-locked page (signed-out `/`, `/inicio`, `/privacidad`, `/terminos`, `/no-existe`) renders light, has a `[data-theme-lock]` root, passes `expectThemeMeta(light)`, leaves storage unchanged, and matches the `a-theme-visual` baselines.
  - Signed in, stored dark: hard-load `/inicio`, then click `.lp-brand` (soft, checked with `softNavMarker`). The app is dark and `expectThemeMeta(dark)` passes. Then `page.goBack()` (soft, app → `/inicio`) gives `expectThemeMeta(light)`.
  - Signed-out, stored dark: `/inicio` → "Entrar" (soft) → `/login` gives `expectThemeMeta(dark)`. The `/login` back link → `/inicio` gives `expectThemeMeta(light)`.
  - Same pathname, lock appears (plan case c): fresh signed-in context on `/`, stored dark; `context.clearCookies()`; click the home pill (`/`, soft). If the landing does not render after the same-URL click (router cache), navigate to `/?_=<timestamp>` as the documented fallback. Then assert the landing rendered and `expectThemeMeta(light)` with pathname `/`. Never clear the shared session. Case (d) below, not this case, is the authoritative check for the lock watcher.
  - Observer guard (plan case d, the independent authoritative check for the lock watcher): on a dark app page, append then remove a `[data-theme-lock]` element via `page.evaluate`; meta and `color-scheme` go light, then back to dark, with no navigation.
  - Locked → app (plan case e): signed in, stored dark, on `/no-existe` (light-locked); click "Volver al inicio" (soft, checked with `softNavMarker`). The app renders dark and `expectThemeMeta(dark)` passes.
- [x] T016 [P] [US4] Add `data-theme-lock="light"` to the `.lp` root of `Landing` and of `LandingPlainPage` only (it also frames `/no-existe`). Never on `LandingFooter`, `LandingMark` or anything `/login` renders (src/components/landing/Landing.tsx, src/components/landing/LandingChrome.tsx).
- [x] T017 [P] [US4] Scope dark to `html.dark:not(:has([data-theme-lock]))`, add `html:has([data-theme-lock]) { color-scheme: light !important }`, and use the same scope in `@custom-variant dark` (src/app/globals.css).
- [x] T018 [US4] Lock-aware runtime and soft-nav sync (src/lib/theme.ts, src/lib/client/theme.ts, src/components/app/ThemeRuntime.tsx). Depends on T016.
  - The init script resets `theme-color` to light on `DOMContentLoaded` when a lock is present.
  - `useTheme`/`setTheme` treat locked pages as light and never write storage.
  - ThemeRuntime recomputes meta `theme-color` and the inline `color-scheme` from `locked ? light : stored ?? OS` on two triggers: an effect on `usePathname()`, and a `MutationObserver` on `document.body` (`childList`, `subtree`, `attributeFilter: [data-theme-lock]`) coalesced per animation frame, applying only when lock presence changed. The same lock state feeds `useTheme`.
- [x] T019 [US4] Verify (tsc, `theme-public`, `theme-switch`, full suite), then make one path-limited commit for the tests and one for the code.

**Checkpoint:** US1 + US4 are shippable: a working switch, light public pages with correct meta across soft navigation, and a partially dark app.

## Phase 5: US2 (P1) A complete, accessible dark palette

- [x] T020 [US2] Tests REQ-6 (tests/e2e/theme-palette.spec.ts).
  - Static scan of `globals.css` (outside the `theme-tokens` markers), `shell.css`, `home.css`, `recipes.css` and `upload-plan-button.css`: literals resolved in-page, failing on L > 0.8. `login.css` is added in T038.
  - Per page: the canvas, surfaces, body text and borders do not equal their light values.
  - Shared UI, and how each is reached:
    - Tooltips: the app has only native `title` tooltips, which the browser draws. Assert the switch `title` and html `color-scheme: dark`.
    - Popovers: the user menu (click `.user-chip`) and the home scope menu (`.home-scope-menu` trigger).
    - Select/dropdown: there is no `<select>`. Use the groceries ingredient combobox (type in the manual-add field to open `.combo-list`) and the native `type="time"` input on home (computed `color-scheme`).
    - Dialogs: open a confirm dialog from plans or trash and cancel it.
    - Toasts: trigger a success toast with the action's API mocked by `page.route` (200), so no data changes.
    - Assistant: the FAB and its open panel.
    - Upload wizard: the parse API mocked by `page.route`.
    - Empty states: a recipe search with no results.
    - Skeleton: `(dashboard)/loading.tsx`, shown by delaying `_rsc` requests during a client navigation.
    - Not-found: `/recipes/<missing-id>` (the recipe not-found state). `/no-existe` is light-locked (D3) and is covered in T015, not here.
    - Error toast / confirm failure: on plans, confirm an action dialog with its API mocked to 500 by `page.route`, declared via `expectedIssues` (T003); the `toast.error` renders and is themed. No data changes. There is no `error.tsx`; the Next dev overlay is out of scope.
  - Recipe image and PDF preview have `filter: none`.
- [x] T021 [US2] Tests REQ-7 (tests/e2e/theme-palette.spec.ts): a contrast audit on every in-scope (dark) page from T004 (`/no-existe` excluded, D3) and on the shared UI states listed in T020, including the recipe not-found state and the error toast.
  - Text needs 4.5:1, or 3:1 for large text.
  - Non-text needs 3:1: control boundaries, icons, focus outline (Tab walk), status marks, and macro bars/rings.
  - States: default, hover, focus-visible, selected/active and placeholder. Disabled controls are skipped.
  - Text over background images must be on an explicit allowlist. The report lists every violation.
- [x] T022 [US2] Tests REQ-8, REQ-9 (tests/e2e/theme-palette.spec.ts).
  - REQ-8: the primary button is brand-600 with white text, links are brand-300/400, and surfaces have hue 167±20° and C ≤ 0.03.
  - REQ-9: the active pill and toggles have L ≥ 0.95, and their text is ≥ 4.5:1.
- [x] T023 [US2] Light semantic tokens inside the `theme-tokens` markers, each equal to today's literal. Expected tokens: `--on-brand`, `--surface-raised`, `--hover-tint`, `--segmented-bg`, `--line-strong`, `--toggle-bg/fg`, `--overlay`, `--shadow-rgb`, `--danger-*`, `--warn-text`, `--brand-400`. Also fix the final `--macro-<key>` names here; T027 and T030 must use exactly these (src/app/globals.css).
- [x] T024 [US2] Full dark token block (src/app/globals.css). Depends on T023.
  - Brand-tinted surfaces ≤ L 0.195, text, brand-300/400 links, toggle inversion and status colors.
  - `--macro-*` lifted to ≥ 3:1.
  - shadcn remap: `--primary` brand-600, `--ring` brand-300, `--border`, `--input`, `--card`, `--popover`.
  - Update `THEME_COLORS.dark` if the canvas changes (src/lib/theme.ts).
- [x] T025 [US2] Migrate the `globals.css` rules outside the markers to tokens: popover hover, danger, segmented, empty, assistant, ingredient-add and drawer backdrop (src/app/globals.css). Depends on T023, T024.

*T026 to T030 depend on T023/T024, because they consume those token names. They don't depend on each other.*

- [x] T026 [P] [US2] Migrate `shell.css`, including `.pill.active` → `--toggle-bg/fg` (src/components/app/shell.css).
- [x] T027 [P] [US2] Migrate `home.css`. It is coupled with T030: both use the `--macro-*` names from T023, and their diffs are checked together (src/components/dashboard/home.css).
- [x] T028 [P] [US2] Migrate `recipes.css`. Images keep no filter; only frames are tokenized (src/components/recipes/recipes.css).
- [x] T029 [P] [US2] Migrate `upload-plan-button.css` (src/components/shared/upload-plan-button.css).
- [x] T030 [P] [US2] Macro colors → `var(--macro-<key>)` with the T023 names. Check that every consumer of `.color` (inline `--group`, any alpha or concatenation) still works (src/components/dashboard/food.ts, src/components/dashboard/DashboardView.tsx).
- [x] T031 [US2] Tune dark values until the REQ-7 audit reports zero violations. If teal-600 is under 3:1 on any surface, add a dark-only `--btn-ring`. Keep `THEME_COLORS.dark` equal to the canvas (src/app/globals.css, src/lib/theme.ts).
- [x] T032 [US2] Verify (tsc, `theme-palette`, `theme-switch`, full suite). `a-theme-visual` is advisory: light must look unchanged. Then commit path-limited: tests, tokens (T023/T024), and one commit per migrated file (T025 to T030), with the final tuning committed separately.

**Checkpoint:** US2 is complete (REQ-6 to REQ-10, REQ-16). REQ-11 is final in T041.

## Phase 6: US3 (P1) Theme transition respects motion preferences

- [x] T033 [US3] Tests REQ-12, REQ-13 (tests/e2e/theme-motion.spec.ts).
  - **REQ-12 (the red test):** a `theme-reveal` animation on `::view-transition-new(root)`, with duration ≤ 600 and the clip origin at the switch center. It fails against the instant `switchTheme` from T010.
  - REQ-13 (reduced motion): no transition animation and an instant change. The icon's computed `transform`, `scale` and `rotate` are `none`, it has no running animation, and `transition-property` excludes transform. This case may already pass against the instant `switchTheme` and T012's CSS; it is a guard, not the red test.
  - With `startViewTransition` removed: instant, with no error.
  - Rapid triple click: final state, storage, icon and name agree, and no `theme-vt` class remains.
  - Recipe list→detail still starts a view transition after a switch.
- [x] T034 [US3] `switchTheme` reveal (src/lib/client/theme.ts).
  - Short-circuits for reduced motion, forced colors, an unsupported API and a lock.
  - `--reveal-x/y/r` come from the trigger, plus `html.theme-vt`.
  - Any pending transition is `skipTransition()`ed.
- [x] T035 [US3] Reveal CSS: `--theme-reveal-duration: 500ms`, `@keyframes theme-reveal`, `::view-transition-old(root)` set to none, and `html.theme-vt * { view-transition-name: none !important }`. The existing reduced-motion VT rule must stay intact (src/app/globals.css).
- [x] T036 [US3] `ThemeToggle` passes `event.currentTarget` as the trigger to `switchTheme` (src/components/app/ThemeToggle.tsx).
- [x] T037 [US3] Verify (tsc, `theme-motion`, `theme-switch`, full suite), then make path-limited commits for the tests and the reveal.

**Checkpoint:** US3 is complete (REQ-12, REQ-13).

## Phase 7: US5 (P2) Login page follows the theme

- [x] T038 [US5] Tests REQ-15 (tests/e2e/theme-login.spec.ts, tests/e2e/theme-palette.spec.ts).
  - Signed-out context with stored dark: `/login` is dark, passes the REQ-4 recorder and `expectThemeMeta(dark)`, shows no switch, and contains no `[data-theme-lock]` element.
  - REQ-6/7/10 audit of the landing-styled parts as well as the card: `.lp-island` (background, border), `.lp-brand` and `.lp-mark`, `.login-back`, the `.lp-btn.login-submit` button, the `.lp-skip` skip link (focused via Tab), `.lp-footer` links, form fields and the `.login-error`/`.login-field-error` states (triggered by submitting an empty name or invalid email, no API call). Each in default, hover and focus-visible: none equals its light value, every text/non-text pair meets AA.
  - Soft nav: `/inicio` → "Entrar" → `/login` gives dark meta. This is green since T018 and acts as a guard.
  - Signing in through the form → app (soft) stays dark.
  - Add `login.css` to the REQ-6 scan. The red part is the scan and audit.
- [x] T039 [US5] Migrate `login.css` to tokens and add the dark `--lp-*` remap (src/components/auth/login.css). `landing.css` is not touched.
  - Replace every literal in `login.css` (card glass, input, error colors, shadows, `white`) with tokens whose light values equal today's literals.
  - Add `@media screen { html.dark:not(:has([data-theme-lock])) .login-page { … } }`, values only as `var(--…)`:
    - `--lp-bg` → canvas, `--lp-surface` → surface, `--lp-ink`/`--lp-ink-2`/`--lp-ink-3` → text-1/2/3, `--lp-line` → line, `--lp-brand` → brand-300, `--lp-mint` → dark focus-halo token, `--lp-brand-deep` → `--btn`, `--lp-brand-deepest` → `--btn` hover shade.
    - Selector overrides under the same scope: `.lp-island` background/border/shadow; `.lp-skip` background `--toggle-bg` and `color: var(--toggle-fg) !important`; `.lp-mark` `--btn`/`--on-brand`; `.lp-btn` default and hover background `--btn`, color `--on-brand`, hover shadow from `--shadow-rgb`; `.lp-footer ul a:hover` color brand-300; `.login-back:hover` `--hover-tint`.
- [x] T040 [US5] Verify (tsc, `theme-login`, full suite), then make path-limited commits.

**Checkpoint:** US5 is complete (REQ-15).

## Phase 8: Final verification

- [x] T041 [US2] REQ-11, the binding comparison. Use the scratch dir.
  1. `git worktree add --detach <scratch>/nm-baseline <T006 SHA>`.
  2. Symlink `node_modules` and `.env.local` (never copy or edit it), then run `npm run db:generate`.
  3. **Harness parity pre-check.** `git diff <T006 SHA> -- playwright.config.ts tests/e2e/` plus `git diff -- playwright.config.ts tests/e2e/` (uncommitted) must be empty, ignoring the theme spec files added after T006 (`theme-*.spec.ts`). If `fixtures.ts`, `theme-helpers.ts`, `screenshot.css` or `a-theme-visual.spec.ts` changed after T006, copy the branch versions of those test files (never `src/`) into the worktree and note it. Expected, harmless differences in the worktree: `package.json` still has the `legacy:dev` script (the user's uncommitted removal), `src/server.js` still exists (its deletion is staged, not committed; nothing imports it), `next-env.d.ts` differs (generated). `git diff <T006 SHA> -- package.json package-lock.json` must show only the `legacy:dev` line, and `npx playwright --version` in the worktree must print 1.63.0.
  4. From the worktree directory, run `npx playwright test a-theme-visual --update-snapshots`.
  5. Copy its snapshot dir into the branch's (gitignored) snapshot dir.
  6. Only then, on the branch, run `npx playwright test a-theme-visual`.
  7. `git worktree remove <scratch>/nm-baseline`.

  Steps 4 and 6 must run sequentially. Nothing is committed.
- [x] T042 [setup] `npx tsc --noEmit` + `npm run test:e2e`, with zero unexpected (undeclared) console errors and failed API calls. Update the spec's Progress checkboxes (specs/theme-switcher/spec.md), but do not commit it unless the user asks.
