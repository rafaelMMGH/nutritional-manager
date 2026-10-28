# Tasks: Assistant chat polish

**Spec:** [spec.md](spec.md) (v1.5) · **Plan:** [plan.md](plan.md) · **Contract:** [contracts/chat-api.md](contracts/chat-api.md)

Format: `- [ ] T### [P] [US#] Description (path/to/file)`.
`[P]` = can run in parallel with other `[P]` tasks in the same batch (different files, no shared dependency).
Task IDs stay stable across revisions, so some appear out of numeric order. New IDs start at T042.

**Order:** setup, then foundational (the shared module, the harness, the CSS move, the whole server answer), then US1, US2, US3 and US5 (all P1), then US4 (P2).
- The server answer is foundational because every UI story renders its contract. The server halves of REQ-6, REQ-10 and REQ-20 are tested there.
- The switcher exists only in US4, so its parts of REQ-5, REQ-13, REQ-14, REQ-15, REQ-20 and REQ-22 are added in US4 (T040).

**Batches:** each `Batch` line is one implement/review cycle, about 300 changed lines or one area.
- **Gate:** `npx tsc --noEmit`, the affected spec files, then one full `npm run test:e2e` (including `a-theme-visual`). The only exception is Batch 2a (see there).
- **Commits:** path-limited, tests then code.
- **Size:** Batch 3 (~450 lines) is larger because the `Turn[]` model and its renderer must land together. Batch 5 is borderline. If review asks, it splits into chips (T018, the chip half of T020, T021, T022) and retry/timeout (T019, the timer half of T020).
- **Repeated files:** `AssistantChat.tsx` and `assistant-chat.css` are edited in most batches. These are accepted per-story increments: each batch touches only its story's elements.

**Global rules:**
- Commits are path-limited (`git add -- <paths>` then `git commit -m "…" -- <paths>`).
  - Messages reference the US, T and REQ IDs.
  - Commits never include `specs/` unless the user asks.
  - `specs/BACKLOG.md` and `specs/bugs/e2e-run-guard.md` are user changes. Leave them alone.
- e2e runs are sequential. Never run two at once, and never leave a background run.
- Do not add npm packages, run `next build` in place, run migrations or use the `shadcn` CLI.
- Copy is es-MX and verbatim from spec v1.5, including the confirmed leads and section titles in the contract. Tests may assert it.
- Every new or changed test is shown red by temporarily breaking the code it protects.
- **Contrast per batch:** each batch styles the elements it adds with theme tokens only (`var(--…)`, including hover and focus states). The existing `theme-palette` audits and hover sweeps must stay green at every gate. T031 only tunes and verifies.
- **Snapshots:** if `a-theme-visual` diffs only in the assistant area, report it to the orchestrator, which asks the user. Run `--update-snapshots` only after the user's explicit yes. A diff outside the assistant area is a regression to fix in the batch.
- **Attribution:** every file adapted from prompt-kit starts with `// Adapted from prompt-kit (https://github.com/ibelick/prompt-kit), MIT License` plus the copyright line copied verbatim from its LICENSE. This covers PromptInput, PromptSuggestion, the loader in AssistantTurn and the scroll button in useChatScroll.

## Phase 1: Setup

- [x] T001 [setup] Create branch `feature/assistant-chat-polish` from `main` (local, no push).
- [x] T002 [setup] Baseline. Run `npx tsc --noEmit` and `npx playwright test dashboard theme-switch theme-palette a-theme-visual`, then record the pass/fail list in the batch notes. Nothing is committed.

## Phase 2: Foundational (blocks all stories)

**Batch 1: shared module, harness, CSS move**

- [x] T003 [foundational] Shared pure module (src/lib/assistant.ts). REQ-1, REQ-4, REQ-5, REQ-10, REQ-19.
  - The `ScopeKey` wire values and labels: auto→Todo, Receta→Esta receta, "Carrito actual"→Carrito.
  - `MAX_MESSAGE` = 500 and `COUNTER_FROM` = 450.
  - `normalizeText`, `words` and `messageLength`.
  - The contract's response types, without `topic`.
  - `Chip`.
  - The page-suggestion builders for the dashboard, groceries and recipe pages, with their scopes. The recipe builder adds "¿Cuánto <proteína> lleva?" only when the recipe has a protein (today's `RecipeDetail` rule).
  - The module must stay importable by client and server (no db or Node imports).
- [x] T004 [P] [foundational] e2e harness (tests/e2e/assistant-helpers.ts).
  - `createChatUser(name)`: inserts a user with a fixed per-file email (e.g. `asistente-e2e-<name>@local`) and a session token via `sql()`. Call it in `beforeAll`.
  - `deleteChatUser()` in `afterAll`: deletes the user's rows. The row is deleted, not left in place, per plan D2: a dead tuple is never returned by `users limit 1`, but a live extra row can be.
  - A `chat` fixture extending `test` from `fixtures.ts`:
    - It depends on `browser`, `baseURL`, `viewport`, `colorScheme`, `reducedMotion` and `issues`.
    - It creates a context with those options, `locale: "es-MX"` and the `nm_session` cookie.
    - Every page it opens calls `watch(page, issues)`, so `expectedIssues` and the zero-undeclared-issues check apply unchanged.
    - The context is closed in teardown.
  - Seeders:
    - `seedRecipes(recipes)`: recipes plus `ingredient_usages`, with a category per ingredient so a protein can be seeded or omitted.
    - `seedCart(n)`.
    - `seedPlan({ times })`: plan plus current `plan_versions.structured_data` with meals, objective, supplements and recommendations.
    - `softDeleteRecipe`.
  - `ask(request, message, scope?, recipeId?)` posts through `page.request`.
  - Locators follow the plan's DOM contract.
  - `mockChat(page, answer, { delayMs, status, abort })` and contract-valid fixtures.
- [x] T005 [P] [foundational] Move the assistant block (`globals.css` ~766-847) verbatim into the feature file imported by `AssistantChat.tsx`, with no visual change. `.spin` stays global (src/app/globals.css, src/components/shared/assistant-chat.css, src/components/shared/AssistantChat.tsx). Guard: T002's specs stay as they were.
- [x] T042 [P] [foundational] Backstop for plan D2: add `order by seq` to the three `users limit 1` reads (tests/e2e/dashboard.spec.ts:163,167,188). Commit this on its own.

**Batch 2a: tests, matcher, routing, schema (REQ-6, REQ-10 server, REQ-19, REQ-20 routing)**

**Gate exception:** T006 is written in full here, but its `describe("builders")` group (REQ-1 content, REQ-3, REQ-18 and the overview content of REQ-20) stays red until Batch 2b. The 2a gate is green for the matcher, routing and schema tests. In the full e2e run, the only failures allowed are that group's tests, and they are listed in the batch notes.

- [x] T006 [foundational] API tests, red first (tests/e2e/assistant-api.spec.ts). Depends on T004. The winner is identified by `kind` + `follow_ups`.
  - Matcher and routing group:
    - REQ-19: every G/W/T, including "¿Qué hago ahora?", the "cuándo" cases, the ties and "desayuno" alone.
    - REQ-6: in Todo, an unrecognized question gets the unknown lead, the capability line as `body` and `kind: "unknown"`, with no objective or meals.
    - REQ-20:
      - Carrito + "¿A qué hora es la cena?" → `out_of_scope`.
      - A soft-deleted recipe → `missing_recipe`, winning over the out-of-scope check.
      - The old fallback texts never appear.
    - REQ-10 server: 501 characters and "   " → 400. 500 characters plus surrounding spaces → 200.
  - `describe("builders")` group:
    - REQ-1:
      - The types are kept and the lead is non-empty.
      - `answer` === the plain-text form, with one question per scope.
      - Empty cart, no plan, and no recipes (Recetario + "hola").
      - A 40-item cart → 8 items and "y 32 más".
      - The Quesadillas/Ensalada/Pollo asado filter.
      - "¿Cuánto pollo lleva?" lists only pollo ingredients.
    - REQ-3: sources only when data is used, and none on unknown replies.
    - REQ-18: all four G/W/T, with highlights only on meals that have a time.
    - REQ-20: the overview content for "hola" in Plan activo, Carrito and Recetario.
    - REQ-5 invariant: each Topics follow-up asked in its own scope is never `unknown` or `out_of_scope`.
    - Confirmed copy: every lead and section title in the contract.
- [x] T007 [foundational] Topic matcher (src/lib/domain/chat-topics.ts). REQ-19.
  - The exhaustive vocabulary, tiers, tie order cart > recipes > plan, and the "cuándo" rule.
  - `isTopicWord`.
  - The follow-up table and "Answers in" per topic.
- [x] T043 [foundational] Routing in `ragAnswer` (src/lib/domain/chat.ts). Depends on T007. REQ-6, REQ-19, REQ-20.
  - The order is missing recipe, then winner, then scope check, then overview or unknown.
  - The fixed-copy replies (unknown, out-of-scope, missing) return `kind`, `body` and empty sections.
  - Topic answers and overviews return their `kind` and `follow_ups`, with today's text as a one-span lead until T009.
  - `context_used` keeps its meaning.
- [x] T008 [P] [foundational] Set `chatSchema.message` to `z.string().trim().min(1).max(500)`. Not a migration (src/lib/validation/schemas.ts). REQ-10.

**Batch 2b: builders (REQ-1, REQ-3 data, REQ-18, REQ-20 overviews)**

- [x] T009 [foundational] Builders per the contract (src/lib/domain/chat.ts). Depends on T043. REQ-1, REQ-3, REQ-18, REQ-20.
  - Meal times from the stored plan's `time_window`.
  - Plan.
  - Recipe list, with the filter.
  - Cart.
  - This recipe, with today's narrowing.
  - Shared helpers for the 8-item cap and the plain-text `answer`.
  - The route file changes only if types require it.

**Checkpoint:** the API meets the contract and T006 is fully green. Existing UI tests still pass, because the panel reads only `answer`.

## Phase 3: US1 (P1) Structured answers

**Batch 3: Turn model, page contexts and the minimal renderer (REQ-4, REQ-12 defaults)**

The old `messages` shape is removed in the same commit that renders `Turn[]` (T011 + T015 + T016), so the gate holds: tsc, the affected specs and a full e2e run are all green.

- [x] T010 [US1] Tests REQ-4 and REQ-12 defaults (tests/e2e/assistant-answers.spec.ts).
  - An answer asked in Recetario is labelled "Recetario", and earlier labels are kept.
  - A search-bar question with "Carrito" is labelled "Carrito".
  - A mocked 500 gives an error turn with no label (`expectIssues`).
  - REQ-12 default scope per page: a typed question is labelled "Todo" on the dashboard, "Carrito" on groceries and "Esta receta" on a recipe page.
- [x] T011 [US1] Client state rewrite (src/components/app/assistant.tsx, src/components/app/AppShell.tsx). REQ-4, REQ-12.
  - `askRag({ message, scope, recipeId })`.
  - `Turn[]`, where the pending turn and its result share one id.
  - The page context `{ subtitle, defaultScope, recipeId?, suggestions: Chip[] }`.
  - `scope` resets on a page-context change, and every request stores its scope.
  - `askInScope(message, scope)`.
  - `Shell.assistantBusy`.
- [x] T012 [P] [US1] Page contexts only declare data, and `useRecipeActions.ask` is removed (src/components/groceries/GroceriesChat.tsx, src/components/recipes/RecipeDetail.tsx, src/components/recipes/useRecipeActions.ts). REQ-4, REQ-12.
- [x] T013 [P] [US1] The search bar sends `ScopeKey` values, with Carrito sent as "Carrito" (src/components/dashboard/DashboardView.tsx). REQ-4.
- [x] T015 [US1] Minimal `AssistantTurn` (src/components/shared/AssistantTurn.tsx). REQ-4, REQ-17 structure.
  - `article[aria-label]`.
  - An `aria-hidden` Bot icon.
  - The scope label.
  - `.assistant-turn-live[aria-live=polite]`, holding `answer` as `pre-line` text or the error text.
  - Today's pending indicator.
  - The user turn as a right-aligned bubble.
  - Token-styled per the contrast rule.
- [x] T016 [US1] `AssistantChat` renders `Turn[]` through `AssistantTurn`, and the log is no longer `aria-live`. Existing ids and classes are kept (src/components/shared/AssistantChat.tsx, src/components/shared/assistant-chat.css). REQ-4.
- [x] T017 [US1] Update the existing chat selectors to `.assistant-turn.assistant:not(.is-pending)` and drop any Todo-fallback assertion per REQ-6 (tests/e2e/dashboard.spec.ts, tests/e2e/theme-switch.spec.ts, tests/e2e/theme-palette.spec.ts).

**Batch 4: server builder change from spec v1.5, then structured rendering (REQ-1 server, REQ-2, REQ-3, REQ-18 UI)**

- [x] T046 [US1] Server builder change from spec v1.5 (tests/e2e/assistant-api.spec.ts, src/lib/domain/chat.ts). REQ-1.
  - Tests first, red (tests/e2e/assistant-api.spec.ts):
    - Multi-line recommendations: 3 non-empty lines plus 1 blank line → "Recomendaciones" has 3 items, and `answer` matches the plain-text form.
    - Empty sections are omitted from `sections` and `answer`, and the lead still shows: a plan with zero meals has no "Comidas" section; a recipe with no steps has no "Preparación" section where it would otherwise show.
  - Then the code (src/lib/domain/chat.ts):
    - Recommendations split into one item per non-empty line, like Preparación steps, with the 8-item cap and "y <n> más".
    - The shared section helper drops sections with no items.

- [x] T014 [US1] Tests REQ-2, REQ-3 and REQ-18 UI (tests/e2e/assistant-answers.spec.ts).
  - With a non-empty cart:
    - One `h3` sits one level below the panel's `h2`.
    - There is one `li` per item.
    - Each quantity has `font-weight ≥ 600`.
  - No heading, item or highlight shows text that is only in `answer`.
  - "Basado en: …" lists every source, and no such line appears without sources or on the unknown reply.
  - Meal times show one item per meal, with highlighted times.
- [x] T044 [US1] Structured `AssistantTurn` (src/components/shared/AssistantTurn.tsx, src/components/shared/assistant-chat.css). REQ-2, REQ-3.
  - Inside the live region, render the lead `<p>`, the body, `<h3>` + `<ul>` per section, `<strong>` highlights and the muted "Basado en" line, replacing the `answer` text.
  - Token-styled.

**Checkpoint:** US1 is complete (REQ-1 to REQ-4, REQ-18, REQ-19).

## Phase 4: US2 (P1) Always a next step

**Batch 5 (borderline size): chips, unknown reply, thinking, retry and timeout (REQ-5 to REQ-8, REQ-20 UI)**

- [x] T018 [US2] Tests REQ-5, REQ-6 UI and REQ-20 UI (tests/e2e/assistant-next-step.spec.ts).
  - Chips show under the latest answer only, and activating one moves them.
  - All chips are disabled while pending, and a click sends nothing (count route hits).
  - Scope labels for chip answers:
    - The groceries chip "¿Qué recetas hay en mi plan?" → "Recetario".
    - The recipe-page cart chip → "Carrito".
  - Protein chip:
    - A recipe with a protein ingredient shows "¿Cuánto <proteína> lleva?" in its empty state. Activating it answers with only that protein's ingredients, labelled "Esta receta".
    - A recipe without a protein has no such chip and 3 suggestions.
  - Repeat rule:
    - Esta receta + "¿Qué ingredientes lleva?" → exactly 2 chips.
    - Non-Esta-receta case: Plan activo + "¿Qué suplementos tomo?" → exactly the 2 chips "¿A qué hora es mi comida?" and "¿Qué recetas hay en mi plan?".
  - Todo unknown → 3 page chips, and no "No pude responder".
  - Out of scope:
    - Recetario + a cart question → the out-of-scope chips.
    - "Preguntar en Todo" re-appends the question and labels the answer "Todo".
    - "¿Qué ingredientes necesito comprar?" → "Carrito".
  - Missing recipe → the 3 dashboard chips, and no "Preguntar en Todo".
  - After navigating to the dashboard, an Esta receta chip and Reintentar still answer about recipe A.
- [x] T019 [US2] Tests REQ-7, REQ-8 (tests/e2e/assistant-next-step.spec.ts).
  - "Pensando…" shows while a delayed mock is pending and is gone afterwards.
  - Fail once (500), then Reintentar on a delayed healthy mock:
    - While the retry is pending, the error turn is replaced by "Pensando…" (no error text, one pending turn).
    - Then the answer and chips appear, the error is gone, and the question appears once.
  - The retry fails again.
  - `route.abort()` gives the error.
  - Timeout:
    - `page.clock.install()` before `goto`, then a held route and `clock.fastForward(15_000)` → the error shows.
    - After the response is released, nothing is added.
  - Each mocked failure is declared with `expectIssues`.
- [x] T020 [US2] (chip half done in Batch 5a) `chipsFor`, retry and timeout (src/components/app/assistant.tsx). REQ-5, REQ-8, REQ-20.
  - Chip lists per `kind`, with the repeat rule filling from the full list.
  - Page suggestions captured at send time and frozen on the turn, with `recipeId` on Receta chips.
  - "Preguntar en Todo" appends the user turn.
  - Reintentar sets the same turn back to pending.
  - The 15 s timer and the generation discard.
  - `console.warn` with context on failure.
- [x] T021 [P] [US2] `PromptSuggestion`, adapted from prompt-kit with attribution (src/components/shared/PromptSuggestion.tsx). REQ-5.
- [x] T022 [US2] (chip rendering done in Batch 5a) Render chips under the latest successful turn (none on error) and the "Pensando…" loader (Loader text variant, with attribution), outside the live region. Render the error with Reintentar. All token-styled (src/components/shared/AssistantChat.tsx, src/components/shared/AssistantTurn.tsx, src/components/shared/assistant-chat.css). Depends on T020, T021. REQ-5 to REQ-8.

**Checkpoint:** US2 is complete (REQ-5 to REQ-8, REQ-20), except the switcher assertions added in T040.

## Phase 5: US3 (P1) Composer and conversation control

**Batch 6: composer (REQ-10 client)**

- [x] T023 [US3] Tests REQ-10 client (tests/e2e/assistant-composer.spec.ts).
  - The field is labelled "Pregunta". The mic and Enviar keep a native `title`.
  - Shift+Enter then Enter sends one 2-line message and clears the field.
  - A double Enter sends one request.
  - At 360 px, Enter adds a newline.
  - IME:
    - In the test, dispatch `new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })` on the textarea, or wrap typing in `compositionstart`/`compositionend` events. Either way, nothing is sent.
    - Do not use CDP `Input.imeSetComposition`, and add no test hooks in app code.
    - Red check: remove the `isComposing` guard.
  - Counter:
    - None at 449, and "450/500" at 450.
    - At 501: "501/500" plus "Máximo 500 caracteres", Enviar disabled and Enter inert.
    - It is the field's `aria-describedby` and sits outside any live region.
  - 500 characters plus spaces are answered.
  - Six lines → the field is 5 lines tall and scrolls.
  - The field and mic stay editable while pending.
  - A dictation error shows as `role=alert`.
- [x] T024 [P] [US3] `textarea` primitive from the cached base-nova JSON (src/components/ui/textarea.tsx).
- [x] T025 [P] [US3] `useMediaQuery` with `useSyncExternalStore`, server snapshot `false` (src/lib/client/useMediaQuery.ts).
- [x] T026 [US3] `PromptInput`, adapted from prompt-kit with attribution (src/components/shared/PromptInput.tsx, src/components/shared/AssistantChat.tsx, src/components/shared/assistant-chat.css). Depends on T024, T025. REQ-10.
  - Autosize to 5 lines.
  - The Enter rules, including `isComposing` or `keyCode 229`.
  - The counter via `aria-describedby`.
  - The mic and Enviar with native `title` (no tooltip).
  - Send disabled when the field is empty or blank, while pending, or over 500.
  - Token-styled.

**Batch 7: Nueva conversación and scroll (REQ-9, REQ-11)**

- [x] T027 [US3] Tests REQ-9, REQ-11 (tests/e2e/assistant-composer.spec.ts).
  - REQ-9:
    - An empty thread shows all page chips and no "Nueva conversación".
    - Activating "Nueva conversación" clears the thread, shows the chips and focuses the input.
    - While pending, it re-enables Enviar and the search bar at once, and the late mock leaves the thread empty.
  - REQ-11, with mocked answers:
    - Scrolled up more than 24 px, the position is kept and "Ir al último mensaje" shows.
    - Activating it puts the log at the bottom, hides the button and moves focus to the input (all widths, per spec Interaction details "Focus").
    - A tall answer has its lead at the log's top.
    - Sending while scrolled up shows the question.
- [x] T047 [US2] Spec v1.6 follow-ups (src/components/shared/AssistantTurn.tsx, src/components/shared/AssistantChat.tsx, tests/e2e/assistant-next-step.spec.ts). REQ-5, REQ-8.
  - Tests first: an older error turn followed by a later answer shows no Reintentar; while a retry is pending no chips show anywhere (including the previous answer's).
  - Then: Reintentar only on the latest assistant turn; `chipsTurnId` treats a pending retry like its error turn.
- [x] T028 [US3] `clear()`: bumps the generation, resets busy and empties the thread (src/components/app/assistant.tsx). REQ-9.
- [x] T029 [US3] `useChatScroll` (scroll button adapted from prompt-kit, with attribution), "Ir al último mensaje" (which focuses the input) and the header "Nueva conversación", all token-styled (src/components/shared/useChatScroll.ts, src/components/shared/AssistantChat.tsx, src/components/shared/assistant-chat.css). Depends on T028. REQ-9, REQ-11.

**Checkpoint:** US3 is complete (REQ-9 to REQ-11).

## Phase 6: US5 (P1) Look, motion and accessibility

**Batch 8: contrast matrix, forced colors, motion (REQ-14, REQ-16)**

- [x] T048 [US3] Spec v1.7 test (tests/e2e/assistant-composer.spec.ts). REQ-10. At 1024 px with a coarse primary pointer (`hasTouch` + coarse-pointer emulation), Enter adds a newline and sends nothing; red-proof by dropping `(pointer: coarse)` from the query. No code change expected.

- [x] T030 [US5] Tests REQ-14, REQ-16 (tests/e2e/assistant-look.spec.ts).
  - Contrast: `auditNow` scoped to `.assistant-chat`, in light and dark, with zero violations, on:
    - a structured answer, chips and sources
    - an error (`expectIssues`)
    - pending
    - the counter over the limit
    - a focused control
    - the user bubble, placeholder, scroll button, ×, Nueva conversación, Reintentar, and send (enabled and disabled)
  - Forced colors: highlights keep weight ≥ 600.
  - Reduced motion:
    - Turns and the loader compute `animation-name: none` or a 0 duration.
    - The panel, scroll button and chips compute 0 durations.
    - `scrollTop` equals the target right after a send and right after "Ir al último mensaje".
  - Without reduced motion, the fade is ≤ 200 ms.
- [x] T031 [US5] Tune and verify only (src/components/shared/assistant-chat.css).
  - Known light-theme AA misses from Batch 5a (must be fixed here): panel header subtitle 4.04:1, input placeholder 3.40:1, input border 1.19:1 (non-text, needs ≥3:1).
  - The elements are already token-styled by their batches.
  - Add the forced-colors rules, the reduced-motion block, 160 ms fades, the user bubble at ≤ 80% width and `overflow-wrap: anywhere`.
  - Fix any token pairing T030 flags.

**Batch 9a: sheet geometry, targets, backdrop (REQ-15, REQ-14 at 360 px)**

- [x] T032 [US5] Tests REQ-15 and REQ-14 at 360 px (tests/e2e/assistant-a11y.spec.ts).
  - At 740×360, the panel is within the viewport and the input is fully visible.
  - At 360×740:
    - The sheet fills the height, the FAB is hidden and `.assistant-chat-backdrop` is present.
    - Every listed target is ≥ 44×44 with no intersections. The switcher is added in T040.
  - Safe areas:
    - Open a CDP session and send `Emulation.setSafeAreaInsetsOverride` with non-zero insets, then assert the sheet's padding is ≥ each inset.
    - If an `env()` probe still reads 0 (no `viewport-fit=cover` in the app, or no support), fall back to comparing against the probe and add a `test.info().annotations` note saying the check is weak.
  - A `visualViewport` stub plus `resize`, and `setViewportSize(360×420)`: the input box lies inside.
  - A long unbroken token wraps, with no horizontal overflow.
  - REQ-14 at 360 px in both themes:
    - The backdrop: `auditNow` with the sheet open, plus an explicit check that the sheet's edge or surface against the backdrop-composited page is ≥ 3:1.
    - Focus rings on the sheet's controls (×, chips, mic, send), via a Tab walk audit.
    - The compact menu is added in T040.
- [x] T045 [US5] Sheet geometry (src/components/shared/AssistantChat.tsx, src/components/shared/assistant-chat.css). Depends on T025. REQ-14, REQ-15.
  - At ≤640 px when open:
    - A full-height sheet with 8 px gutters.
    - The FAB is hidden.
    - `.assistant-chat-backdrop` uses `var(--overlay-modal)`, with no click action.
  - The `visualViewport` vars `--vv-height` and `--vv-top`.
  - `max(…, env(safe-area-inset-*))` padding.
  - 44 px targets.
  - The narrow header layout.
  - Token-styled.

**Batch 9b: live region, modality and focus (REQ-17, REQ-22)**

- [x] T033 [US5] Tests REQ-17, REQ-22 (tests/e2e/assistant-a11y.spec.ts).
  - From the Batch 5a review: after a chip click the clicked chip becomes disabled and focus drops to `body`. Cover focus after chip / Reintentar / "Preguntar en Todo" (input on desktop; log then new turn at ≤640 px).
  - REQ-17:
    - Turns are exposed as "Tú" and "Asistente", and the icon is hidden.
    - While pending, the live region has no "Pensando…". After the answer, it holds the lead and every item, and not the user message, chips or label.
    - On error, it holds the error text but not "Reintentar", and Reintentar is next in tab order.
    - A script-focused turn has `tabIndex=-1`.
    - Existing accessible names are unchanged: FAB "Abrir asistente"/"Cerrar asistente", input "Pregunta", "Enviar", and the dictation alert.
  - REQ-22:
    - Opening the panel focuses the input.
    - On desktop, a page link stays clickable.
    - At 360 px:
      - Tab never leaves the sheet.
      - The page does not scroll and is inert.
      - × closes the sheet and focus returns to the FAB.
    - Escape closes the panel and focuses the FAB.
    - Closing while pending, then reopening: the answer is there and the FAB has no badge.
    - Chip at 360 px: focus is on the log while pending, then on the new turn. On desktop, focus is on the input.
    - Failing chip at 360 px: focus is on the error turn, then Tab moves to Reintentar (`expectIssues`).
- [x] T034 [US5] Modality (src/components/app/AppShell.tsx). REQ-22.
  - `sheet = open && narrow`.
  - `inert` on `.topbar` and `main.content`.
  - Scroll lock on `<html>`.
- [x] T035 [US5] Focus and the live region (src/components/shared/AssistantChat.tsx, src/components/shared/AssistantTurn.tsx). Depends on T034. REQ-17, REQ-22.
  - From the Batch 9a review: at ≤640 px `close()` calls `fabRef.focus()` while the FAB is still `display:none`, so × and Escape leave focus on `body`. Focus the FAB after it renders (`flushSync` or an open→closed effect) and test both × and Escape at 360 px.
  - Tab wrap in the sheet.
  - Interaction details "Focus", including × returning focus to the FAB.
  - The region persists across pending → answer/error.

**Checkpoint:** US5 is complete (REQ-14 to REQ-17, REQ-22), except the switcher parts added in T040.

## Phase 7: US4 (P2) Scope in the panel

**Batch 10: switcher and search bar (REQ-12, REQ-13, REQ-21)**

- [x] T036 [US4] Tests REQ-12, REQ-21 (tests/e2e/assistant-scope.spec.ts).
  - REQ-12:
    - Options per page, with "Esta receta" only on a recipe page.
    - The switcher shows the page default: Todo on the dashboard, Carrito on groceries, Esta receta on a recipe page.
    - Pick Recetario and ask: the new answer is labelled "Recetario" and the earlier one "Todo".
    - Switch to Carrito while pending: the pending answer is labelled "Todo" and the next one "Carrito".
    - Navigating to groceries keeps the thread, and the switcher shows "Carrito".
  - REQ-21 desktop: on Todo, ArrowRight + Enter → "Plan activo" is pressed and focused.
  - REQ-21 at 360 px:
    - Opening "Alcance: Todo" focuses Todo.
    - ArrowDown ×2 + Enter closes the menu, and the button reads "Alcance: Recetario".
    - Escape closes the menu and focuses the button.
- [x] T037 [US4] Tests REQ-13 (tests/e2e/assistant-scope.spec.ts).
  - Switcher Todo and bar Recetario: the input is focused, the answer is labelled "Recetario" and the switcher stays "Todo".
  - The bar's input and scope button are disabled while pending. The spec says "submit", but the bar has no submit control.
  - A 501-character bar question sends nothing.
- [x] T038 [US4] `ScopeSwitcher` (src/components/shared/ScopeSwitcher.tsx, src/components/shared/AssistantChat.tsx, src/components/shared/assistant-chat.css). REQ-12, REQ-14, REQ-21, REQ-22.
  - Desktop: a ToggleGroup labelled "Alcance" that ignores empty values.
  - Compact: a button + listbox. Escape calls `preventDefault` and `stopPropagation`, and the panel skips `defaultPrevented` events.
  - Selection shows a border plus a check icon.
  - Token-styled.
- [x] T039 [P] [US4] Search bar (src/components/dashboard/DashboardView.tsx). REQ-13.
  - Disabled while `assistantBusy`.
  - Skips a trimmed length over 500.
  - Uses `askInScope`.
- [ ] T040 [US4] Switcher assertions in earlier specs (tests/e2e/assistant-next-step.spec.ts, tests/e2e/assistant-look.spec.ts, tests/e2e/assistant-a11y.spec.ts). REQ-5, REQ-14, REQ-15, REQ-20, REQ-22.
  - REQ-5: a groceries chip leaves the switcher at "Carrito".
  - REQ-20: "Preguntar en Todo" leaves it at "Recetario".
  - REQ-14:
    - The switcher states (default, selected, focus) in both themes.
    - At 360 px in both themes: the open compact menu and its focus rings.
    - Under forced colors, the selected scope's border or check is visible.
  - REQ-15: switcher and menu targets are ≥ 44 with no overlap.
  - REQ-22: Escape closes the menu and the panel stays open. A second Escape closes the panel and focuses the FAB.

**Checkpoint:** US4 is complete (REQ-12, REQ-13, REQ-21). All 22 REQs are covered.

## Phase 8: Final verification

- [ ] T041 [setup] `npx tsc --noEmit` and one full `npm run test:e2e`, with zero undeclared console errors or failed API calls.
  - Manual phone check at Gate 3 (from the Batch 9b review; not automatable). iPhone Safari + VoiceOver and Android Chrome + TalkBack:
    1. Sheet open: swiping on gutters and log edges never scrolls the page.
    2. Keyboard up: the sheet shrinks and the composer stays visible.
    3. Chip: no keyboard pop-up; the answer is announced once; focus on the log doesn't read the whole log.
    4. Failing chip (airplane mode): error announced; Reintentar reachable.
    5. Swipe navigation never reaches the page behind the sheet.
    6. × (and Escape on a hardware keyboard) returns focus to the FAB.
    7. A visible toast does not block ×.
    8. Rotating to landscape >640 px while open: the page scrolls again and focus is sane.
    9. Notched device: safe areas look acceptable (env() is 0 without viewport-fit=cover; backlog).
  - Apply the snapshot policy above.
  - Optionally, check a production build in a scratch copy, never in place.
  - Tick only the spec's Progress boxes (specs/assistant-chat-polish/spec.md) and report. Do not change **Status**, because the orchestrator owns status changes. Do not commit spec edits unless the user asks.

## Coverage

| REQ | Tasks |
|---|---|
| 1 | T003, T006, T009, T046 |
| 2 | T014, T016, T044 |
| 3 | T006, T009, T014, T044 |
| 4 | T010–T013, T015, T016 |
| 5 | T003, T006, T018, T020–T022, T040 |
| 6 | T006, T043, T018, T022 |
| 7 | T019, T022 |
| 8 | T019, T020, T022 |
| 9 | T027–T029 |
| 10 | T006, T008, T023–T026 |
| 11 | T027, T029 |
| 12 | T010–T012, T036, T038 |
| 13 | T037, T039 |
| 14 | T030–T032, T045, T038, T040 |
| 15 | T032, T045, T040 |
| 16 | T030, T031 |
| 17 | T015, T033, T035 |
| 18 | T006, T009, T014 |
| 19 | T006, T007, T043 |
| 20 | T006, T043, T009, T018, T020, T040 |
| 21 | T036, T038 |
| 22 | T033–T035, T038, T040 |
