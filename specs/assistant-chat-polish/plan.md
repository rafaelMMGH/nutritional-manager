# Plan: Assistant chat polish

**Spec:** [spec.md](spec.md) · **Version:** 1.4 · **Checklist:** [checklists/ux.md](checklists/ux.md) · **Contract:** [contracts/chat-api.md](contracts/chat-api.md)

## Decisions

- **D1 Reply kind in the response.** The server adds `kind` and `body` alongside the spec's lead, sections and follow-ups (additive). There is no `topic` field because nothing reads it. Tests identify the winning topic by `follow_ups`, since each topic's list is distinct. Topic follow-ups come from the server. The unknown, out-of-scope, missing-recipe and empty-state chip lists are derived on the client from `kind` plus the page suggestions captured at send time. The repeat rule runs only on the client, in one function.
- **D2 Isolated e2e user.**
  - Chat tests run as their own user. Each spec file's `beforeAll` inserts the user and a session via `sql()` with a fixed per-file email, then seeds recipes, cart items and a plan. `afterAll` deletes the user's rows. Login still picks the lowest `seq`, so the main user's data and the other specs are untouched.
  - **Why delete instead of leaving the row:** `dashboard.spec.ts:163,167,188` read `users limit 1` with no `order by`. A deleted row is never returned: once the delete commits, its dead tuple is invisible to every later snapshot. A live extra row can be returned. An `UPDATE` of the main user (the goal PATCH, or a login) writes a new tuple version after the chat user's line pointer, and a seq scan then returns the chat user first. Assistant specs sort before `dashboard.spec.ts`, so a row left in place would break those reads. Deleting is the safe choice.
  - As a backstop against a crashed `afterAll`, T042 adds `order by seq` to those three reads in its own commit. Leftovers cannot outlive a run, because the e2e DB is cloned and dropped per run.
- **D3 Copy confirmed** (spec v1.4 Interaction details "Copy"). Tests may assert every lead and section title in the contract.
- **D4 No tooltips.** The mic and Enviar buttons keep their native `title`. There is no `ui/tooltip.tsx`.
- **D5 Dead code.** `formatAnswer` in `src/lib/client/api.ts` is left alone (unrelated, Constitution 7).

## Approach

**Server: one pure matcher and one answer builder.**
- `src/lib/assistant.ts` is a new pure module shared by client and server (2 real uses, Constitution 3). It holds the wire scope keys and labels, `MAX_MESSAGE = 500`, `COUNTER_FROM = 450`, `normalizeText`, `words` (`/[\p{L}\p{N}]+/gu`), `messageLength` (trimmed `.length`), the page-suggestion lists and the response types.
- `src/lib/domain/chat-topics.ts` holds the exhaustive vocabulary, `isTopicWord`, `matchTopic` (tiers, tie order, "cuándo" rule; REQ-19) and the follow-up table.
- `src/lib/domain/chat.ts` keeps `ragAnswer(db, userId, question, scope, recipeId?)` and routes per the contract: missing recipe, then winner, then the scope check, then overview or unknown.
  - Batch 2a lands the routing with the fixed-copy replies (unknown, out-of-scope, missing). Until Batch 2b, topic answers carry today's text as a one-span lead.
  - Batch 2b adds the builders, which return `{lead, sections, sources}`. One helper caps sections at 8 items with "y <n> más", and one builds `answer`.
- `chatSchema.message` becomes `z.string().trim().min(1).max(500)`. The route and `loadFor(user, "cart", "recipes")` stay; the plan collections are already in `recipeCollections`.

**Client state (`src/components/app/assistant.tsx`).**
- One `askRag({message, scope, recipeId})` replaces the per-page `ask` callbacks.
- The page context becomes `{subtitle, defaultScope, recipeId?, suggestions: Chip[]}` with `Chip = {text, scope, recipeId?}`.
- The thread is `Turn[]`:
  - user: `{id, role: "user", text}`
  - assistant: `{id, role: "assistant", request, status: "pending" | "answer" | "error", answer?, chips}`
- The pending turn and its result share one id, so the live-region element persists (REQ-17).
- `send` keeps the `busyRef` guard and starts a 15 s timer. A module-level `generation` counter plus the request id discard late answers after a timeout or Nueva conversación (REQ-8, REQ-9).
- Requests are never aborted (REQ-22).
- `chipsFor(answer, question, page)` implements REQ-5. Chips are frozen on the turn, and Esta receta chips keep the request's `recipeId`.
- The switcher scope resets to `defaultScope` when the page context changes (REQ-12). `askInScope` serves the search bar and bumps a `focusInput` counter (REQ-13).
- The old `messages` shape is removed in the same commit that adds the `Turn[]` renderer (Batch 3), so no batch ships a model that the panel cannot render.

**UI: prompt-kit adapted by hand, with no CLI, markdown or stick-to-bottom packages.**
- Files under `src/components/shared/`:
  - `AssistantChat.tsx`: the shell. It keeps `#assistant-chat-panel`, `.assistant-chat(.open)`, `.assistant-fab(.open)` and `.assistant-chat-close`, which existing tests use.
  - `AssistantTurn.tsx`
  - `PromptInput.tsx`: autosize to 5 lines, Enter rules, counter via `aria-describedby`, mic and Enviar with native `title`.
  - `PromptSuggestion.tsx`
  - `ScopeSwitcher.tsx`
  - `useChatScroll.ts`: 24 px stick-to-bottom, long answers shown from the top, "Ir al último mensaje", instant under reduced motion.
- Each file adapted from prompt-kit (PromptInput, PromptSuggestion, the Loader text variant in AssistantTurn, and the scroll button in useChatScroll) starts with an attribution comment: `Adapted from prompt-kit (https://github.com/ibelick/prompt-kit), MIT License`, followed by the copyright line copied verbatim from prompt-kit's LICENSE.
- `src/components/ui/textarea.tsx` comes from the cached base-nova JSON.
- `src/lib/client/useMediaQuery.ts` (`useSyncExternalStore`) provides the `≤640px` and reduced-motion flags. It has 4 uses: PromptInput, AssistantChat, useChatScroll and AppShell.
- `AssistantTurn` grows in two steps:
  - Batch 3 (minimal): the `article`, the scope label, the live region with `answer` as `pre-line` text, today's pending indicator and the error text.
  - Batch 4 (structured): lead `<p>`, `<h3>` + `<ul>`, `<strong>` highlights and the "Basado en:" line.

**DOM contract for tests:**
- `.assistant-turn.user` and `.assistant-turn.assistant`, each an `<article aria-label="Tú|Asistente">`.
- The assistant turn contains `.assistant-turn-label` and `.assistant-turn-live[aria-live=polite]`.
- `.assistant-chips` sits outside the live region, and `.is-pending` marks a pending turn. The Bot icon has `aria-hidden`.
- The log is `.assistant-chat-log` with `tabIndex=-1` and is not live.
- `.assistant-chat-backdrop` is present only while the sheet is open.

**Scope switcher (REQ-21).** Both variants are rendered and CSS shows one.
- Desktop: Base UI `ToggleGroup` (empty values ignored) labelled "Alcance".
- Narrow: a hand-rolled "Alcance: <scope>" button with `role="listbox"` and roving `role="option"` items. Its Escape handler calls `preventDefault` and `stopPropagation`, and the panel's Escape listener skips `defaultPrevented` events.

**Sheet and modality (REQ-15, REQ-22).** Two steps:
- Batch 9a, geometry:
  - At ≤640 px the sheet is full height with 8 px side gutters. The FAB is hidden.
  - `.assistant-chat-backdrop` (`var(--overlay-modal)`) covers the page. Clicking it does nothing, because the spec defines no backdrop action.
  - `visualViewport` listeners write `--vv-height` and `--vv-top`.
  - Padding uses `max(…, env(safe-area-inset-*))`, and targets are 44 px.
- Batch 9b, modality: AppShell's `sheet = open && narrow` sets `inert` on `.topbar` and `main.content` and locks scrolling on `<html>`. Tab wraps inside the sheet. Focus follows Interaction details "Focus". Desktop stays non-modal.

**CSS.**
- The assistant block (`globals.css:766-847`) moves verbatim to `src/components/shared/assistant-chat.css` before any change.
- **Per-batch rule:** each batch styles the elements it adds with theme tokens only (`var(--…)`, including hover and focus). The existing `theme-palette` audits, hover sweeps and contrast stay green at every batch gate. T031 only tunes and verifies against the full REQ-14/REQ-16 matrix; styling does not start there.
- Class names are `assistant-*`, never Tailwind utility names.
- Fades are 160 ms, and reduced motion sets 0 durations and instant scrolling.
- Forced colors uses a `Highlight` border plus a check icon.
- The many edits to `AssistantChat.tsx` and `assistant-chat.css` across batches are accepted per-story increments: each batch touches only its story's elements.

## Components

| Component | Change | Files |
|---|---|---|
| Shared constants/types | new | `src/lib/assistant.ts` |
| Matcher, answer, schema | new / modified | `src/lib/domain/chat-topics.ts`, `chat.ts`, `src/lib/validation/schemas.ts` |
| Client state | modified | `src/components/app/assistant.tsx`, `AppShell.tsx` |
| Page contexts, search bar | modified | `groceries/GroceriesChat.tsx`, `recipes/RecipeDetail.tsx`, `recipes/useRecipeActions.ts`, `dashboard/DashboardView.tsx` |
| Panel UI | new / modified | `shared/AssistantChat.tsx`, `AssistantTurn.tsx`, `PromptInput.tsx`, `PromptSuggestion.tsx`, `ScopeSwitcher.tsx`, `useChatScroll.ts`, `assistant-chat.css` |
| Primitive, hook | new | `ui/textarea.tsx`, `src/lib/client/useMediaQuery.ts` |
| Global CSS | modified | `src/app/globals.css` (assistant block removed) |

## Data model and interfaces

- No schema change and no migration. The interface is [contracts/chat-api.md](contracts/chat-api.md).
- `HomeView`'s `askAssistant(message, scope)` keeps its signature, with `scope` now a `ScopeKey`. `Shell` gains `assistantBusy`.

## Dependencies

None added. The plan uses the installed `@base-ui/react` 1.5 (toggle-group), `lucide-react` and `@playwright/test` 1.63 (`page.clock`, `emulateMedia`, CDP sessions).

## Testing strategy

- All tests are Playwright e2e, written before their code, and each is shown red by breaking the code it protects.
- `tests/e2e/assistant-helpers.ts` provides:
  - The `chatUser`/seeding helpers (D2).
  - A `chat` fixture built on `fixtures.ts`'s `test`. It depends on `browser`, `baseURL`, `viewport`, `colorScheme`, `reducedMotion` and `issues`, and opens a context with those options, `locale: "es-MX"` and the `nm_session` cookie. Every page it creates calls `watch(page, issues)`, so the zero-undeclared-issues rule and `expectedIssues` apply unchanged.
  - `ask()` through `page.request`.
  - `mockChat(page, answer, {delayMs, status, abort})` with contract-valid fixtures.
- API tests check content. UI tests mock `/api/rag/chat` when only rendering, scroll or timing is under test.
- **Gates:** every batch gate runs tsc, the affected specs and one full `npm run test:e2e`, including `a-theme-visual`. Exception: Batch 2a, whose builder tests stay red until 2b.
- **Snapshots:** a `a-theme-visual` diff limited to the assistant area is reported to the orchestrator, which asks the user. `--update-snapshots` runs only on the user's explicit yes. A diff outside the assistant area is a regression to fix.

| REQ | File | How |
|---|---|---|
| 1, 3 (data), 6, 10 (server), 18, 19, 20 | `assistant-api.spec.ts` | API against the seeded user. Every G/W/T, `answer` === plain text, Topics follow-ups resolve in their scope, 501 / "   " → 400 |
| 2, 3, 4, 12 (default label), 18 | `assistant-answers.spec.ts` | labels per scope and page default, heading level, `<li>` count, `font-weight ≥ 600`, "Basado en" |
| 5, 6, 7, 8, 20 | `assistant-next-step.spec.ts` | chip lists incl. protein chip and the 2-chip minimum, disabled while pending, retry → "Pensando…", `page.clock` timeout |
| 9, 10, 11 | `assistant-composer.spec.ts` | Enter rules, synthetic `isComposing` keydown (no CDP IME, no app hooks), counter, autosize, scroll, "Ir al último mensaje" → input |
| 14, 16 | `assistant-look.spec.ts` | `auditNow` scoped to `.assistant-chat`, both themes, `forcedColors`, `reducedMotion` |
| 14 (backdrop, 360 px), 15, 17, 22 | `assistant-a11y.spec.ts` | 360×740, 740×360, 44 px targets, backdrop contrast, CDP safe-area override, `visualViewport` stub, live region, names, Tab walk, inert, focus |
| 12, 13, 21 (+ switcher parts of 5, 14, 15, 20, 22) | `assistant-scope.spec.ts` | toggle group and listbox keys, defaults and reset, search bar, compact-menu contrast at 360 px |

Existing chat tests in `dashboard.spec.ts`, `theme-switch.spec.ts` and `theme-palette.spec.ts` get selector updates only, in Batch 3 with the renderer.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Todo no longer blends plan/cart/recipes (REQ-6) | Existing assertions | They only check "not No pude responder" and visibility. T002 records a baseline, and every gate re-runs them |
| Visual snapshots include the FAB and the empty panel | Suite fails | Snapshot policy above. The desktop FAB is unchanged |
| Extra users in the cloned DB vs `users limit 1` | Wrong user read in `dashboard.spec.ts` | D2: delete in `afterAll` (dead tuples are invisible), plus T042 `order by seq` |
| Base UI ToggleGroup differs from Radix | Wrong a11y | Ignore empty values. REQ-21 tests check roles |
| `page.clock` vs Next dev timers | Flaky REQ-8 | Install it only in that test. Fallback: one real 15 s wait with `test.setTimeout(60_000)` |
| `visualViewport` cannot shrink natively | REQ-15 test could pass vacuously | Stub `visualViewport` and dispatch `resize`, and also check `setViewportSize(360×420)` |
| `env(safe-area-inset-*)` is 0: no `viewport-fit=cover` in the app, and desktop Chromium | Weak REQ-15 check | Try CDP `Emulation.setSafeAreaInsetsOverride`. If the `env()` probe still reads 0, fall back to the probe comparison and annotate the test (open issue: `viewport-fit=cover` is app-wide) |
| Forced colors drops backgrounds | Selected scope invisible | Border plus check icon, asserted by computed style |
| Live announcements not observable | REQ-17 checked structurally only | Assert region contents. The region stays mounted from pending onwards |
| Inert siblings let Tab escape to the browser chrome | REQ-22 | Explicit Tab wrap |
| Batch 3 (~450 lines) and Batch 5 (~400) exceed ~300 lines | Long reviews | Batch 3 cannot split without an unrenderable model. Batch 5 is borderline and may split chips (T018, T020–T022 chips) from retry (T019, T020 timer) if review asks |

## Constitution check

- [x] 1 Every REQ has e2e tests written before the code and shown red per batch.
- [x] 2 Spec untouched. Interpretations are in the contract, and wording nits go to spec-change.
- [x] 3 New shared pieces have ≥2 uses: `assistant.ts` (client and server), `useMediaQuery` (4), and the `chat` fixture (6 specs). The tooltip was dropped.
- [x] 4 No new dependency.
- [x] 5 No secrets: the session token is generated in the test.
- [x] 6 Network, HTTP and timeout failures surface as the error turn plus a `console.warn` with context.
- [x] 7 Path-limited commits per batch, with tests and code committed separately. T042 has its own commit.
