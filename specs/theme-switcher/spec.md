# Spec: Theme switcher (light / dark)

**Status:** implemented
**Version:** 1.6 · **Branch:** feature/theme-switcher · **Owner:** Rafael Martinez

## Overview

The app has only a light theme. The user often checks the meal plan, recipes and shopping list in low light, where a bright UI is uncomfortable. A `.dark` block already exists in global styles, but it only overrides the default neutral component tokens: the app's own brand (Acapulco sage-teal) and surface variables are not covered, and about 149 hard-coded colors live in feature stylesheets. A switch alone would produce a half-dark app. This feature delivers a complete, accessible dark theme for the signed-in app and login, plus a switch to choose it.

## Goals / Non-goals

- Goal: every in-scope screen renders fully in a dark palette that meets WCAG AA (REQ-6, REQ-7).
- Goal: the choice persists across reloads with no flash of the wrong theme (REQ-3, REQ-4).
- Goal: the light theme looks as it does today, and print is always light (REQ-11, REQ-16).
- Non-goal: dark theme for `/inicio`, `/privacidad`, `/terminos` and the root not-found page (REQ-14); theming Next's dev error overlay; a visible "Sistema" option; per-user storage in the database; live sync between open tabs; fixing pre-existing light-theme AA issues.

## Decisions

- Full dark theme, not just a switch (real palette + hard-coded colors replaced): existing `.dark` covers only neutral tokens; a switch alone leaves a half-dark app.
- Scope = all signed-in pages including `/settings`, all shared UI, and login: the user uses the whole signed-in app in low light; settings is a signed-in page.
- `/inicio`, `/privacidad`, `/terminos` stay light-only: the landing has the most hard-coded colors and is marketing; the legal pages belong to it.
- Root not-found page (`src/app/not-found.tsx`, e.g. `/no-existe`) stays light-only (user decision, 2026-10-22): it is built with the landing chrome (`LandingPlainPage`, `landing.css`, which is excluded) and sits outside the signed-in app.
- Follow OS `prefers-color-scheme` (live) until the user picks; after a click the explicit choice persists and OS changes are ignored; no "Sistema" option: the switch is binary (light/dark).
- Persist per browser (not per user), applied before first paint; not in Postgres, no migration: personal single-machine app.
- Storage blocked or failing falls back to the OS preference with a console warning, never an error: the e2e suite fails on console errors (Constitution 6: failures are logged).
- Icon-only switch in the signed-in topbar next to the account chip, visible at all viewport widths; login has no switch: user specified topbar placement; login is visited rarely.
- Accessible state via name swap, not `aria-pressed`: one mechanism only; the name states the action.
- Transition `reveal` (circular reveal from the button) bounded at ≤ 600 ms; reduced motion gets instant change or a fade ≤ 200 ms: originates at the click; CLAUDE.md requires reduced-motion respect.
- Component (user's choice, 2026-10-22, after the planning spike): the app's own sun/moon icon toggle using the already-installed `lucide-react` icons, not the uiarc theme-switch: uiarc needed ~17 undefined CSS variables, used `aria-pressed` (against REQ-1), was 38 px (< 44 px, REQ-1) with an English default label, so it would need heavy edits and upkeep.
- `reveal` is built with the View Transitions API and plain CSS; no `motion` and no new dependency: `motion` only added the icon spin, the page-wide reveal is app code either way, and the app already uses view transitions.
- Dark surfaces are tinted with the brand hue at low chroma, not neutral gray: keeps the Acapulco identity.
- Primary buttons stay teal-600 with white text; teal as text/links/icons on dark uses the 300/400 shades: darker shades fail contrast on dark backgrounds.
- Toggles and the active nav pill invert to near-white with dark text in dark: keeps their intentional black-in-light prominence.
- `color-scheme` and `theme-color` follow the active theme: native controls and browser chrome must match.
- AA is required for dark; light only must not regress: light is unchanged by design, so its pre-existing issues are a separate concern.
- Contrast and regression checks use only the pinned `@playwright/test` 1.63.0 (computed styles, screenshot comparison); adding axe-core would need the user's yes, so it is not assumed: Constitution 4.
- Printing always uses light (REQ-16): paper output (e.g. shopping list) must stay legible and ink-friendly.
- Definition of done: every REQ below has a passing e2e test (Constitution 1), with zero console errors and failed API calls.

## User stories

In-scope pages: home (`/`), recipes list and detail, groceries (lists, cart, templates), plans (incl. upload review wizard), trash, settings, login, and the error and not-found states that exist inside the signed-in app (e.g. the recipe not-found/empty state, error toasts and confirm failures). There is no custom `error.tsx`; Next's dev error overlay is framework UI and out of scope; the root not-found page is light-only per REQ-14. Shared UI: topbar, nav, user menu, popovers, dialogs, toasts/notifications, tooltips, select/dropdown menus, date inputs, skeleton/loading states, empty states, assistant FAB and panel, semantic status colors (success/warning/danger), data visuals (macro bars, progress rings, charts).

### US1 (P1): Choose a theme that sticks
As the app's user, I want a switch that sets light or dark and remembers it so that I don't re-pick it on every visit.

- **REQ-1:** The topbar shows one icon-only switch next to the account chip. Its icon shows the current theme (sun in light, moon in dark); its accessible name and tooltip/title state the action: "Cambiar a tema oscuro" in light, "Cambiar a tema claro" in dark; it exposes no pressed state. Touch target ≥ 44×44 CSS px.
  - Given I am signed in on any in-scope page at 1280 px or 360 px viewport width, when the page loads, then the switch is visible in the topbar (not inside a menu), measures ≥ 44×44 px, has the name and title for the current theme, has no `aria-pressed`, and is operable with Tab + Enter/Space.
- **REQ-2:** Activating the switch toggles the whole page between light and dark.
  - Given light, when I activate the switch, then the computed `color-scheme` of `<html>` is `dark`, the page background equals the dark theme's value, the icon is the moon and the name is "Cambiar a tema claro"; activating again yields `color-scheme` `light`, the light page background, sun and "Cambiar a tema oscuro".
- **REQ-3:** The explicit choice persists in the browser across reloads, new tabs and sign-out.
  - Given I selected dark, when I reload, open a new tab, or sign out and sign in again, then the app renders dark.
- **REQ-4:** The active theme is applied in the document as first delivered and parsed, before any app script runs.
  - Given a stored choice opposite to the OS preference, when any in-scope page is hard-reloaded with a Playwright init script that records the computed `color-scheme` of `<html>` at the moment `<body>` is first inserted (before any app bundle executes), then the recorded value equals the stored theme, and the value after hydration is the same with no change recorded in between.
- **REQ-5:** With no stored choice, the theme follows the OS preference, including live changes.
  - Given no stored choice and OS dark, when I load the app, then it renders dark (OS light → light).
  - Given no stored choice and the app open, when the OS preference changes, then the app switches to match without reload.
  - Given a stored choice, when the OS preference changes, then the app keeps the stored choice.

### US2 (P1): A complete, accessible dark palette
As the user, I want every screen to be properly dark and readable so that dark mode is comfortable, not half-finished.

- **REQ-6:** Every in-scope page and shared UI element themes completely in dark. No image gets a theme-dependent filter. Images without decoration have `filter: none`; decorative illustrations keep their light-theme drop-shadow unchanged.
  - Given dark, when an e2e test visits each in-scope page and opens each shared UI element, then the computed page background, surface backgrounds, body text and borders do not equal their light-theme values.
  - Given the in-scope stylesheets (`src/app/globals.css` outside the light/dark theme token definitions, and feature CSS under `src/components/**` for signed-in pages and login; EXCLUDING the stylesheets of `/inicio`, `/privacidad`, `/terminos`, e.g. `src/components/landing/landing.css`), when an automated scan runs, then no color literal (hex, `rgb()`/`rgba()`, `hsl()`, `oklch()`, named color) with OKLCH lightness > 0.8 remains. Literals inside the token definitions are allowed; intentional light-on-dark uses (e.g. white text on brand buttons) must reference a theme token.
  - Given dark, when an image is shown (today only bundled dish illustrations; recipe photos and PDF previews do not exist, but the rule applies if added), then its computed `filter` equals its light-theme value (`none` if undecorated, the unchanged drop-shadow if decorative) and contains no invert, brightness, grayscale or hue-rotate.
- **REQ-7:** Dark meets WCAG 2.1 AA: text ≥ 4.5:1, large text ≥ 3:1, UI component boundaries, icons, focus indicators of all interactive controls, status colors used as graphics and data-visual marks ≥ 3:1 against adjacent colors. Data marks (filled arcs/bars, and every gradient stop of a mark) are measured at their minimum contrast against the card surface they sit on. The unfilled track of a gauge or ring whose value is also shown as text is not a data mark and is exempt. States audited: default, hover, focus-visible, selected/active, placeholder; disabled controls are exempt.
  - Given dark, when the e2e contrast check (computed foreground/background colors of each audited element and state; each data mark at its lowest-contrast gradient stop against its card surface; unfilled tracks of text-backed gauges/rings skipped) runs on each in-scope page, then it reports zero violations.
- **REQ-8:** Brand in dark: primary action buttons are teal-600 with white text; teal text, links and icons on dark surfaces use the 300/400 shades; surfaces use the brand teal hue (within ±20° of teal-600's hue) at chroma low enough to read as tinted neutral (OKLCH C ≤ 0.03). Exact tokens are a plan decision and must pass REQ-7.
  - Given dark, when I inspect a primary button, a teal link and the page and card backgrounds, then the button is teal-600/white, the link is a 300/400 shade, and the surfaces satisfy the hue and chroma rule.
- **REQ-9:** Toggles and the active nav pill render near-white (OKLCH L ≥ 0.95) with dark text in dark.
  - Given dark, when I view the nav and any toggle, then the active pill and toggle fills have L ≥ 0.95 and their text meets 4.5:1.
- **REQ-10:** The document's `color-scheme` matches the active theme, and the `theme-color` meta equals the active theme's page background; both update on switch and on live OS change (REQ-5).
  - Given light, when I switch to dark (or the OS changes with no stored choice), then `color-scheme` is dark and `theme-color` equals the dark page background, and native scrollbars, checkboxes, date and select inputs render in their dark style.
- **REQ-11:** The light theme does not regress.
  - Given light, when each in-scope page is compared by Playwright screenshot comparison against a baseline captured on `main` before implementation, with dynamic content (dates, times, counters) and the switch's topbar area masked, then each page differs by at most `maxDiffPixelRatio` 0.01.
- **REQ-16:** Printing always uses the light theme.
  - Given dark is active, when an in-scope page is rendered for print (print media emulation), then the computed page background and body text equal the light theme's values.

### US3 (P1): Theme transition respects motion preferences
As the user, I want a pleasant transition that never forces motion on me.

- **REQ-12:** Switching uses a circular reveal originating at the switch, with a configured duration ≤ 600 ms.
  - Given no reduced-motion preference, when I activate the switch, then the new theme expands as a circle from the switch, and the configured animation duration is ≤ 600 ms.
- **REQ-13:** With `prefers-reduced-motion: reduce`, there is no spatial animation.
  - Given reduced motion, when I activate the switch, then the theme changes instantly or by a fade with configured duration ≤ 200 ms, with no movement or scaling.

### US4 (P1): Public pages stay light
As the user, I want the landing and legal pages unaffected so that the marketing pages look as designed.

- **REQ-14:** `/inicio`, `/privacidad`, `/terminos` and the root not-found page (any unmatched URL, e.g. `/no-existe`) always render light, with light `color-scheme` and `theme-color`, regardless of stored choice or OS; visiting them does not change the stored choice.
  - Given a stored dark choice (or no choice and OS dark), when I open each of these pages, including an unmatched URL such as `/no-existe`, then they render light with light `color-scheme` and `theme-color`, and screenshot comparison per REQ-11 passes.
  - Given I came from a dark signed-in page, when I navigate back into the app, then it renders dark and the stored choice is still dark.

### US5 (P2): Login page follows the theme
As the user, I want the login page to match my theme so that signing in is not a bright flash.

- **REQ-15:** `/login` renders in the stored theme, or the OS theme if none is stored, and has no switch of its own.
  - Given a stored dark choice, when I open `/login`, then it renders dark satisfying REQ-4, REQ-6, REQ-7 and REQ-10, and shows no theme switch.

## Edge cases and errors

- Storage blocked or failing: the switch still toggles the current page; next load follows the OS; a console warning (never an error) is logged; UI does not break (REQ-3).
- View Transitions API unsupported: the theme changes instantly with no animation and no console error (REQ-12).
- Rapid repeated toggles: the last click wins; final theme, stored choice, icon and name agree; no stuck overlay or overlapping-animation artifacts (REQ-2, REQ-12).
- Other open tabs: they pick up the new choice on their next load; live cross-tab sync is out of scope (REQ-3).
- Recipe list ↔ detail `<ViewTransition>`: still animates in both themes and after a switch; the theme reveal still works on recipe pages (REQ-12).
- OS theme changes live (no stored choice) while a popover, dialog or the assistant panel is open: it re-themes in place without closing (REQ-5).
- Switch clicked while the non-modal assistant panel is open: the panel stays open and re-themes in place (REQ-2).
- Switch clicked while a popover is open: the theme changes and no console error occurs; whether the popover stays open is not asserted. Modal dialogs make the topbar inert, so the switch is not reachable then (REQ-2).
- Printing: always light, whatever the active theme (REQ-16).
- Forced colors / high-contrast mode: OS forced colors take precedence. Given forced colors emulated active, the switch is visible, keyboard-focusable and toggles the stored choice with no console errors (REQ-1).
- Sign-out or another user in the same browser: the choice is per browser and survives sign-out (REQ-3).

## Non-functional requirements

- Accessibility: dark per REQ-7; switch per REQ-1; light per REQ-11.
- Rendering: no flash of the wrong theme (REQ-4).
- Motion: per REQ-12 and REQ-13.
- Dependencies: none new (see Decisions).

## Assumptions

- None outstanding; prior assumptions were accepted by the user and are stated as requirements or decisions.

## Open questions

- None.

## Progress

- [x] US1 (P1): switch, persistence, no flash, OS default (REQ-1 to REQ-5) — committed b46b97a; dark palette for the topbar pending US2
- [x] US2 (P1): dark palette, contrast, brand, native color-scheme, light unchanged, print light (REQ-6 to REQ-11, REQ-16)
- [x] US3 (P1): reveal transition and reduced motion (REQ-12, REQ-13)
- [x] US4 (P1): public pages stay light (REQ-14)
- [x] US5 (P2): login follows theme (REQ-15)

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-22 | Initial spec |
| 1.1 | 2026-10-22 | Verifier round 1: fallback without dependency, accepted assumptions made requirements, measurable checks, split US1, public-pages REQ, edge cases; REQs renumbered (draft) |
| 1.2 | 2026-10-22 | Verifier round 2: added REQ-16 (print light); REQ-6 scan threshold and scope; observable checks for REQ-2/REQ-4; assertable popover and forced-colors edge cases |
| 1.3 | 2026-10-22 | Spec change (user decision after planning spike): own `lucide-react` sun/moon toggle + View Transitions API and plain CSS; uiarc theme-switch and `motion` dropped, no new dependency. No REQ behavior, numbering or acceptance criteria changed |
| 1.4 | 2026-10-22 | Spec change (user decision): REQ-14 extended to the root not-found page (light-only, landing chrome); in-scope inventory states which error/not-found states are in scope (signed-in app only; no custom `error.tsx`; Next dev overlay out of scope); Decisions and Non-goals updated. No other REQ changed |
| 1.5 | 2026-10-23 | Spec change, wording only, user decision: REQ-6 image clause and its Given/When/Then reworded (no theme-dependent image filter; undecorated images `filter: none`, decorative illustrations keep their light drop-shadow), since the app has no recipe photos or PDF previews today. No behavior or numbering change |
| 1.6 | 2026-10-23 | Spec change, wording only, user decision: REQ-7 and its Given/When/Then clarify that data marks (filled arcs/bars, every gradient stop) are measured at minimum contrast against their card surface, and the unfilled track of a gauge/ring whose value is also shown as text is not a data mark and is exempt from 3:1. No behavior or numbering change |
