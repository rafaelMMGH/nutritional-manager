# Plan: Theme switcher (light / dark)

**Spec:** [spec.md](spec.md) · **Version:** 1.4 · **Checklist:** [checklists/ux.md](checklists/ux.md)

## Decisions (user, 2026-10-22)

- **D1 = Branch B.** No uiarc component, no `motion`, no new dependency. Own sun/moon toggle with `lucide-react` (installed), the View Transitions API and plain CSS.
- **D2 = gitignore** `tests/e2e/*-snapshots/`. REQ-11 screenshots contain personal data; regenerated locally, never committed.
- **D3 = root not-found stays light** (spec v1.4, REQ-14). `/no-existe` renders through `LandingPlainPage`, so it is locked with `/privacidad` and `/terminos`. In-scope dark error coverage is the recipe not-found/empty state plus an error toast / confirm failure. There is no custom `error.tsx`; the Next dev error overlay is out of scope.

## Approach

**State lives on `<html>`, not in React.** A blocking inline script in the root layout `<head>` runs before any bundle. It reads `localStorage.getItem("nm-theme")` (`"light" | "dark"`; absent = follow the OS), falls back to `matchMedia("(prefers-color-scheme: dark)")`, then sets `html.dark`, the inline `color-scheme` on `<html>` and a script-created `<meta name="theme-color">`. React's `<html>` className is static, so `suppressHydrationWarning` only silences the script's additions and hydration does not undo them. `src/lib/client/theme.ts` reads and writes the same DOM state: `getTheme`, `setTheme`, and `useTheme` (`useSyncExternalStore` over a `MutationObserver`).

Storage uses only `getItem`/`setItem`/`removeItem` (so the blocked-storage stub applies), wrapped in try/catch. On failure the theme still applies to the page and a `console.warn` with context runs, never `console.error` (Constitution 6). Covers REQ-3/4/5/10.

**OS follow (REQ-5).** The runtime subscribes to `prefers-color-scheme` `change` and reapplies class, color-scheme and theme-color only when nothing is stored. `useTheme` has two consumers (Constitution 3): `ThemeToggle` and `ThemeRuntime`.

**ThemeRuntime** (`src/components/app/ThemeRuntime.tsx`), mounted once in the root layout in place of the bare `<Toaster>`:
1. Renders Sonner's `Toaster` with the effective theme (Sonner defaults to light).
2. Keeps meta `theme-color` and the inline `color-scheme` equal to `lock present ? light : stored ?? OS`. It recomputes on two triggers: an effect on `usePathname()`, and a `MutationObserver` on `document.body` (`childList` + `subtree`, `attributeFilter: [data-theme-lock]`) coalesced to one `requestAnimationFrame`, which applies only when the lock's presence actually changed. The observer is needed because the lock can change with no pathname change: signed-out `/` is rewritten to `/inicio` by middleware, so clicking the home pill (`/`) after the session cookie is gone swaps the app for the locked landing while `usePathname()` stays `/`. The same lock state feeds `useTheme`, so the Toaster follows it too. `usePathname()` is never trusted; only the lock attribute is.

**Public pages stay light (REQ-14).** The `.lp` roots in `Landing.tsx` and in `LandingPlainPage` (`LandingChrome.tsx`; it frames `/privacidad`, `/terminos` and `/no-existe`) carry `data-theme-lock="light"`. The attribute is never put on `LandingFooter` or `LandingMark`, which `/login` also renders, and never on the login root. Dark tokens are scoped to `html.dark:not(:has([data-theme-lock]))`. `html:has([data-theme-lock]) { color-scheme: light !important }` beats the inline style before hydration. On `DOMContentLoaded` the init script resets `theme-color` to light when a lock is present; after hydration ThemeRuntime keeps both in sync. Nothing writes storage on locked pages. The Tailwind `dark:` variant is redefined to the same scoped selector inside `@media screen`.

**Token architecture (US2).** `globals.css` gets `/* theme-tokens:start */ … /* theme-tokens:end */` markers around the `:root` light tokens and the dark block; the REQ-6 scan exempts only those regions.
1. *Light:* current values unchanged. New semantic tokens replace every hard-coded literal in in-scope CSS, each light value equal to the literal it replaces, so light renders identically (REQ-11). Expected set: `--on-brand`, `--surface-raised`, `--hover-tint`, `--segmented-bg`, `--line-strong`, `--toggle-bg`/`--toggle-fg`, `--overlay`, `--shadow-rgb`, `--danger-text`, `--danger-fill`, `--warn-text`, `--brand-400` (new, unused in light), and `--macro-<key>` for the eight data-visual colors in `src/components/dashboard/food.ts` (which then emits `var(--macro-<key>)`; `home.css` and `food.ts` use the identical names fixed in the light-token task).
2. *Dark:* inside `@media screen { html.dark:not(:has([data-theme-lock])) { … } }`, so print resolves light (REQ-16); `@media print { html { color-scheme: light !important } }` overrides the inline `color-scheme`, which stays because REQ-4 needs it before CSS/hydration. Starting values, tuned by the REQ-7 test:
   - Canvas ≈ `oklch(0.165 0.011 166)`, surface ≈ `oklch(0.195 0.012 166)`: hue within ±20° of teal-600 (167°), C ≤ 0.03 (REQ-8). Surfaces a primary button can sit on stay at L ≤ 0.195 so teal-600 keeps ≥ 3:1 (2.98 measured at L 0.20).
   - Text-1/2/3 ≈ L 0.95/0.85/0.72. `--btn` = brand-600 with `--on-brand` white; teal text, links and icons use `--brand-300`/`--brand-400`. `--toggle-bg` ≈ `oklch(0.97 0.005 166)`, `--toggle-fg` = canvas (REQ-9). Lighter red/amber status colors; `--macro-*` lifted where below 3:1.
   - shadcn tokens (`--background`, `--card`, `--popover`, `--primary` = brand-600, `--ring` = brand-300, `--border`, `--input`) remapped, replacing today's neutral `.dark`; `color-scheme: dark` in the block. `THEME_COLORS.dark` equals the final canvas.
3. *Migration*, file by file: `globals.css` rules, `shell.css`, `login.css`, `home.css`, `recipes.css`, `upload-plan-button.css`, `food.ts`. `landing.css` is untouched. Images and PDF previews get no `filter`; only their frames use tokens.

**Login on landing styles (US5).** `LoginForm` renders `<div class="lp lp-js login-page">` and reuses `.lp-skip`, `.lp-island`, `.lp-brand`, `.lp-mark`, `.lp-btn` and `LandingFooter` (`.lp-footer`), all styled by `landing.css` through `--lp-bg`, `--lp-surface`, `--lp-ink`, `--lp-ink-2`, `--lp-ink-3`, `--lp-line`, `--lp-brand`, `--lp-brand-deep`, `--lp-brand-deepest`, `--lp-mint` (plus the `.lp :where(h1..h3)` color and `.lp :where(a, button, summary):focus-visible` outline). `landing.css` stays untouched (it is outside the REQ-6 scan and serves locked pages). Instead, `login.css` (in the scan scope) adds a block under `@media screen { html.dark:not(:has([data-theme-lock])) .login-page { … } }`:
- Variable remap, values only as `var(--…)` app tokens (no literals): `--lp-bg` → canvas, `--lp-surface` → surface, `--lp-ink/-2/-3` → text-1/2/3, `--lp-line` → line, `--lp-brand` → brand-300 (focus outline, input focus border), `--lp-mint` → a dark focus-halo token, `--lp-brand-deep`/`--lp-brand-deepest` → `--btn` and its hover shade.
- Selector overrides where a variable serves both fill and text, or where landing.css uses literals: `.lp-island` background/border/shadow (literal white glass), `.lp-skip` (background `--lp-ink` with `color: white !important`, which inverts badly once `--lp-ink` is light: needs `--toggle-bg`/`--toggle-fg` with `!important`), `.lp-mark` (white on `--lp-brand`: pinned to `--btn`/`--on-brand`), `.lp-btn` default/hover (`--btn`/`--on-brand`, hover shadow from `--shadow-rgb`), `.lp-footer ul a:hover` (uses `--lp-brand-deep` as text: pinned to brand-300), `.login-back:hover` tint.
- The block is scoped by the dark selector, so it never applies under a lock, and the login root never carries the lock (asserted by test).

**Switch (US1), Branch B.** `ThemeToggle.tsx`, one component with no wrapper (Constitution 3): a plain `<button type="button">`, 44×44, inside `.topbar-account` next to the user chip at all widths. `aria-label` and `title` read "Cambiar a tema oscuro/claro"; no `aria-pressed`. Stacked lucide `Sun`/`Moon` with `data-icon` on the visible one; opacity-only crossfade (≤ 150 ms), no transform, `transition: none` under reduced motion. Forced colors: `ButtonText` border, `currentColor` icons. The button only calls `switchTheme(next, trigger)`.

**Reveal (US3).** `switchTheme(next, trigger?)` applies instantly for reduced motion, forced colors, a missing `document.startViewTransition`, or a present lock (REQ-13, unsupported-API edge case). Otherwise it sets `--reveal-x/y/r` from the trigger's center, adds `html.theme-vt`, calls `startViewTransition(apply)`, and removes the class on `finished`. CSS: `html.theme-vt::view-transition-new(root)` runs `theme-reveal` (clip-path `circle(0)` → `circle(var(--reveal-r))`) for `--theme-reveal-duration: 500ms`; `::view-transition-old(root)` gets `animation: none`; `html.theme-vt * { view-transition-name: none !important }` keeps `site-header` and the recipe `.morph`/`.text-morph` names out of the snapshot. Rapid toggles: a module-level pending transition is `skipTransition()`ed; state and storage are written synchronously, last target wins.

## Components

| Component | Change | Files |
|---|---|---|
| Init script + constants | new | `src/lib/theme.ts` (key, `THEME_COLORS`, lock attr, `themeInitScript`) |
| Runtime + hook + reveal | new | `src/lib/client/theme.ts` |
| Root layout | modified | `src/app/layout.tsx` (`<head>` script, `suppressHydrationWarning`, `ThemeRuntime`) |
| Toaster + meta/lock sync | new | `src/components/app/ThemeRuntime.tsx` |
| Topbar switch | new / modified | `src/components/app/ThemeToggle.tsx`, `AppShell.tsx`, `shell.css` |
| Tokens + migration | modified | `src/app/globals.css`, `shell.css`, `home.css`, `recipes.css`, `upload-plan-button.css`, `dashboard/food.ts`, `DashboardView.tsx` |
| Login dark (incl. `--lp-*` remap) | modified | `src/components/auth/login.css` |
| Public lock | modified | `Landing.tsx` root, `LandingPlainPage` root in `LandingChrome.tsx` (attribute only) |
| Test harness | new / modified | `tests/e2e/fixtures.ts` (incl. `expectedIssues`), `theme-helpers.ts`, `screenshot.css` |
| Repo | modified | `.gitignore` (D2) |

## Data model and interfaces

No data model: one `localStorage` key, `nm-theme`; no Prisma or migration changes; no API routes. Interfaces: `type Theme = "light" | "dark"`; `useTheme(): Theme` (effective; light when locked); `switchTheme(next: Theme, trigger?: HTMLElement): void`; `THEME_COLORS: Record<Theme, string>` (a test asserts it equals the computed canvas).

## Dependencies

None added (D1). Uses `lucide-react` and `@playwright/test` 1.63.0 (`toHaveScreenshot` with `stylePath`, `emulateMedia` for colorScheme/reducedMotion/forcedColors/print). Contrast is computed without axe-core.

## Testing strategy

All tests are Playwright e2e in `tests/e2e/`, written before the code they cover.

**Fixture.** The `issues` fixture moves to `tests/e2e/fixtures.ts`: it fails on `pageerror`, console type `"error"` and `/api/` responses ≥ 400; `console.warn` does not fail it (blocked-storage tests collect warnings themselves). It gains an opt-in `expectedIssues: RegExp[]` option (default `[]`): the list is a multiset: each declared entry is consumed by exactly one matching issue, at most once. A matching issue beyond the declared count fails the test, and a declared entry left unconsumed fails the test. Two real consumers (Constitution 3), both on the same mocked 500 on one plans action (one API issue plus the browser's "Failed to load resource" console line): the T020 dark error-toast state and the T021 contrast audit of that toast.

**Helpers** (`tests/e2e/theme-helpers.ts`): `seedTheme`; `blockThemeStorage` (wraps `Storage.prototype` methods to throw only for `nm-theme`); in-page `toRgb` via canvas (Chrome reports `oklch()`); `contrast`, `oklch`, `effectiveBackground` (composites alpha up the ancestors); `expectThemeMeta(page, theme)`; `softNavMarker` (`window.__soft` survives = client navigation); the in-scope page list with IDs from `sql()`. `tests/e2e/screenshot.css` hides `nextjs-portal` and is passed as `stylePath`.

| REQ | Where | Test |
|---|---|---|
| 1, 2 | `theme-switch.spec.ts` | 1280/360 px placement, ≥ 44, name/title, no `aria-pressed`, keyboard; toggle twice; assistant stays open; popover + switch gives no error; forced colors |
| 3, 4, 5 | `theme-switch.spec.ts` | reload / new page / fresh-context form sign-in; blocked storage; `<body>`-insertion recorder; OS default, live flip with dialog/assistant open, stored choice ignores the OS |
| 10 | `theme-switch.spec.ts` | `color-scheme` + theme-color = canvas after switch and live OS flip; native time input dark |
| 16 | `theme-switch.spec.ts` | dark + print media: canvas/body text = light values, html `color-scheme` light |
| 14 | `theme-public.spec.ts` | `/`, `/inicio`, `/privacidad`, `/terminos`, `/no-existe` light (stored dark, OS dark), storage unchanged, screenshots; soft-nav and same-pathname lock cases |
| 6, 7, 8, 9 | `theme-palette.spec.ts` | per page + shared UI (list in tasks), static CSS scan, contrast audit across states, brand/hue/chroma, pill/toggle L ≥ 0.95 |
| 11 | `a-theme-visual.spec.ts` | light screenshots, `maxDiffPixelRatio: 0.01`, masks for dates/times/counters and `.topbar-account` |
| 12, 13 | `theme-motion.spec.ts` | `theme-reveal`, ≤ 600 ms, origin = switch center; reduced motion instant, no transform; unsupported API; rapid clicks; recipe morph still runs |
| 15 | `theme-login.spec.ts` | `/login` dark incl. island/brand/button/skip-link/footer states, no lock attribute, no switch; soft nav `/inicio` → `/login` |

**Soft-navigation cases (REQ-10/14/15):** (a) signed in, stored dark: hard-load `/inicio`, click `.lp-brand` → app dark meta; `goBack()` → light meta. (b) Signed out, stored dark: `/inicio` → "Entrar" → `/login` dark meta; back link → `/inicio` light meta. (c) Same pathname, lock appears: in a fresh signed-in context on `/` (dark), `context.clearCookies()`, click the home pill (`/`); middleware serves the landing at `/` and meta/color-scheme become light without a pathname change. If the landing does not render after the same-URL click (router cache), the documented fallback is to navigate to `/?_=<timestamp>` before asserting. (d) Observer guard, the independent authoritative check for the lock watcher: on a dark app page, `page.evaluate` appends then removes a `[data-theme-lock]` element; meta and `color-scheme` go light, then dark, with no navigation. (e) Locked → app: on `/no-existe` (light-locked), signed in with stored dark, click "Volver al inicio" → soft nav into the app, dark, `expectThemeMeta(dark)`.

**REQ-11 baseline:** the first branch commit adds the visual spec and captures snapshots against unchanged `main` app code (local only, D2). Runs in later phases are advisory (live data and date drift). Only the final comparison binds: a `git worktree` at the baseline SHA in the scratch dir, harness parity checked first (T041), baseline regenerated there, snapshots copied over, then compared on the branch. Runs are strictly sequential (port 3200, `<db>-e2e` clone). The `a-` prefix runs the visual spec before `dashboard.spec.ts` mutates data.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Teal-600 vs dark surfaces sits at 3:1 | REQ-7 violations | Surfaces ≤ L 0.195; else a dark-only `--btn-ring` brand-400 1px border |
| Login inherits light literals from `landing.css` (`.lp-island` glass, `.lp-skip` `white !important`) | Light patches on dark login, REQ-6/7 failures | Explicit `.login-page` overrides in `login.css`; T038 audits each state |
| Screenshot baseline drift (live data/date) | Flaky REQ-11 | Advisory mid-way runs, binding same-day worktree comparison, masks, hidden dev indicator |
| Baseline worktree differs from branch harness | False REQ-11 diffs | T041 parity pre-check; only app code may differ |
| Lock root mounts late, or the lock changes without a pathname change | Wrong theme-color | Body `MutationObserver`; soft-nav case (c); Landing has no `loading.tsx` |
| Next serves the same-URL click from the router cache | Case (c) never swaps | Case (d) is the independent authoritative check for the lock watcher; case (c) falls back to `/?_=<timestamp>` if the landing does not render, then asserts |
| Chromium hides VT pseudo-element animations from `getAnimations` | REQ-12 untestable as designed | Fallback: computed `animation-name`/`duration` on `::view-transition-new(root)` |
| Theme `startViewTransition` racing a navigation transition | Skipped morph | Tested; pending transition skipped cleanly |
| Dirty working tree carried onto the branch | Unrelated user changes committed | Path-limited commits (tasks.md global rule) |

## Constitution check

- [x] 1 Tests first in every phase; REQ-10/16 tests precede the init script and dark tokens.
- [x] 2 Branch B is the spec's approved fallback; /no-existe light per spec v1.4.
- [x] 3 No toggle wrapper; `useTheme` has two consumers; `fixtures.ts` shared by 7 specs; `expectedIssues` used by T020 and T021.
- Definition of done: tsc clean and the full e2e suite green with zero unexpected (undeclared) console errors and failed API calls.
- [x] 4 No new dependency. 5 `.env.local` only symlinked. 6 Storage failures warn with context.
- [x] 7 Path-limited commits, one concern each.
