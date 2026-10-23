# Checklist: UX and accessibility for theme-switcher

Requirement-quality checks ("unit tests for English"). Each item checks whether the **spec** is complete, clear, and measurable, not whether the code works. Unchecked items block spec approval.

Checked against spec v1.4 (REQ-1 to REQ-16).

## Completeness

- [x] Are switch placement, icon-only form and Spanish accessible names specified? [REQ-1]
- [x] Is keyboard operation of the switch (Tab + Enter/Space) specified? [REQ-1]
- [x] Is the login page behavior (themed, no switch) specified? [REQ-15]
- [x] Is switch behavior defined at narrow/mobile viewports (does it stay visible in the topbar) and is a minimum touch target size given? [REQ-1]
- [x] Is the icon per state (sun/moon) defined, and is there a sighted-user cue (tooltip/title) for an icon-only control? [REQ-1]
- [x] Is the state exposed to assistive tech chosen (name swap vs pressed state, not both)? [REQ-1, Decisions]
- [x] Do visible focus indicators of all interactive elements (not only the switch) have a ≥ 3:1 requirement in dark? [REQ-7]
- [x] Are interactive states (hover, active, selected, placeholder, disabled exemption) covered by the contrast requirement? [REQ-7]
- [x] Is the shared-UI inventory complete (toasts, tooltips, select/dropdown menus, date pickers, skeleton/loading, empty states), and does it name which error and not-found states are in scope (signed-in recipe not-found/empty state, error toasts, confirm failures), that there is no custom `error.tsx`, and that Next's dev error overlay is out? [User stories scope, REQ-6]
- [x] Are semantic/status colors and data visuals (success/warning/error, macro colors, progress) defined for dark? [User stories scope, REQ-7, REQ-8]
- [x] Is print output defined as always light, with a Given/When/Then using print media emulation and asserting computed page background and body text equal the light values? [REQ-16, Decisions, Edge cases]
- [x] Is there a numbered requirement with Given/When/Then that `/inicio`, `/privacidad`, `/terminos` and the root not-found page (unmatched URL, e.g. `/no-existe`) always render light (even with stored dark or OS dark) with light `color-scheme` and `theme-color`, and restore the theme on return? [REQ-14]

## Clarity

- [x] Is the reveal duration bounded with a number (≤ 600 ms)? [REQ-12]
- [x] Is the reduced-motion alternative bounded (instant or fade ≤ 200 ms, no movement/scaling)? [REQ-13]
- [x] Is the hard-coded-color rule automatable: named stylesheet scope (globals.css outside token definitions, feature CSS under `src/components/**`), explicit exclusion of landing/legal CSS, a numeric "light" threshold (OKLCH L > 0.8), the literal forms covered, and the token-definition exemption? [REQ-6]
- [x] Does the light-theme "no visible difference" have a numeric tolerance (`maxDiffPixelRatio` 0.01), a defined tool, a baseline source (`main`) and masking rules? [REQ-11]
- [x] Are "tinted" surfaces and "near-white" given concrete values or a measurable rule (hue ±20°, C ≤ 0.03; L ≥ 0.95)? [REQ-8, REQ-9]
- [x] Are the `theme-color` values defined, and is it required to update on switch and on live OS change? [REQ-10]
- [x] Is the contrast audit tool/method named, with the page list and states audited? [REQ-7, Decisions]
- [x] Is the no-flash check defined measurably (computed `color-scheme` recorded when `<body>` is first inserted, equal to stored theme and unchanged through hydration)? [REQ-4]

## Consistency

- [x] Do REQ-13 and the CLAUDE.md reduced-motion rule agree? [REQ-13]
- [x] Does REQ-7 (dark only) agree with NFR and Definition of Done, and is light-theme AA reconciled with "light unchanged"? [REQ-7, REQ-11, Decisions, NFR]
- [x] Is the live OS-follow behavior stated as a requirement, not only as an edge-case assumption? [REQ-5]
- [x] Is the edge case "popovers stay open while switching" replaced by an assertable one (theme changes, no console error), given outside-click dismissal and modal dialogs making the topbar inert? [Edge cases]
- [x] Do the in-scope inventory, Non-goals, Decisions and REQ-14 agree that the root not-found page is light-only and the signed-in recipe not-found state is dark (no page in both lists)? [User stories scope, Goals/Non-goals, Decisions, REQ-14]

## Edge cases

- [x] Is blocked/failing storage behavior defined (toggles for the page, console warning, no error)? [Edge cases, REQ-3]
- [x] Are user images/PDF previews excluded from inversion, with a computed `filter: none` assertion? [REQ-6]
- [x] Is behavior defined when the View Transitions API is unsupported? [Edge cases, REQ-12]
- [x] Is behavior defined for rapid repeated toggles during a running transition? [Edge cases, REQ-2, REQ-12]
- [x] Is behavior defined for already-open other tabs when the choice changes? [Edge cases, REQ-3]
- [x] Is the interaction with the existing recipe list/detail `<ViewTransition>` defined? [Edge cases, REQ-12]
- [x] Is forced-colors / high-contrast mode addressed with a testable Given/Then (emulated, switch visible, focusable, toggles, no console errors)? [Edge cases, REQ-1]
- [x] Is persistence across sign-out and a different user in the same browser stated? [REQ-3, Edge cases]
