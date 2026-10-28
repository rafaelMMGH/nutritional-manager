# PR draft: Assistant chat polish

**Title:** Assistant chat polish: structured answers, next-step chips, new composer, phone sheet, scope switcher

**Base:** `main` · **Branch:** `feature/assistant-chat-polish`

---

## Summary

This PR reworks the assistant (the floating chat on every signed-in page) into a clearer flow: you ask, it shows that it's thinking, and it answers. It keeps the rule-based engine (no AI calls) and adds no npm packages and no database changes.

- **Structured answers:** each answer has a lead sentence, titled sections with lists, values in bold (times, quantities), an optional "Basado en: …" line, and a label showing which scope answered. There is a new **meal-times** topic.
- **A next step after every answer:**
  - 2–3 follow-up chips, each asked in its own scope.
  - A friendly reply when the assistant doesn't know.
  - "Preguntar en Todo" when a question is out of scope.
  - "Pensando…" while it works.
  - "Reintentar" on failures and after a 15 s timeout.
- **Composer:**
  - The field grows to 5 lines.
  - Enter sends on desktop; on phones and touch tablets Enter adds a newline.
  - IME-safe.
  - A 450/500 counter with a 500-character limit.
  - "Nueva conversación", and stick-to-bottom scrolling with "Ir al último mensaje".
- **Look and accessibility:**
  - WCAG AA in light and dark, plus forced colors.
  - At ≤640 px the panel becomes a full-height modal sheet with a backdrop: the page is inert, Tab wraps, and targets are 44 px.
  - Reduced motion is respected.
  - Each assistant turn has a polite live region, and focus rules are defined.
- **Scope switcher ("Alcance"):**
  - Desktop shows a segmented group; phones show a compact listbox.
  - Navigating resets the scope to the page default.
  - The dashboard search bar uses its own scope once, and is disabled while a request is pending.

Prompt-kit patterns (PromptInput, PromptSuggestion, the Loader text variant, the scroll button) are adapted by hand onto Base UI with plain CSS. MIT attribution is in each file.

## Spec

- `specs/assistant-chat-polish/spec.md` (v1.8, status `implemented`)
- Plan: `plan.md`; tasks: `tasks.md`; API contract: `contracts/chat-api.md`; UX checklist: `checklists/ux.md` (60/60)

## Behavior changes to the existing assistant

- **One topic per question,** picked by a fixed precedence: time words, then explicit topic words, then a bare meal noun.
- **Scopes are strict.** An out-of-scope question gets the unknown reply plus "Preguntar en Todo". A question that matches nothing in a narrowed scope returns that scope's overview.
- **"Todo" no longer falls back to the plan summary.** An unrecognized question gets the unknown reply.
- **The recipe-list filter** ignores stop words and topic words, and matches whole words of 3 or more letters.
- **`POST /api/rag/chat`:**
  - Now rejects messages that are blank or longer than 500 characters after trimming (400).
  - The response only gains fields (`kind`, `lead`, `body`, `sections`, `follow_ups`). `answer`, `context_used` and `sources` are unchanged.

## Status per requirement

| REQ | Status | Main tests |
|---|---|---|
| 1 Structured content | Met | `assistant-api` builders, `assistant-next-step` |
| 2 Rendering | Met | `assistant-answers` |
| 3 Sources | Met | `assistant-api`, `assistant-answers` |
| 4 Scope label | Met | `assistant-answers` |
| 5 Follow-up chips | Met | `assistant-next-step`, `assistant-api` |
| 6 Unknown reply | Met | `assistant-next-step`, `assistant-api` |
| 7 Pensando… | Met | `assistant-next-step` |
| 8 Errors, retry, timeout | Met | `assistant-next-step` |
| 9 Nueva conversación | Met | `assistant-composer` |
| 10 Composer and limits | Met | `assistant-composer`, `assistant-api` |
| 11 Scroll | Met | `assistant-composer` |
| 12 Scope switching | Met | `assistant-scope`, `assistant-answers` |
| 13 Search-bar scope | Met | `assistant-scope` |
| 14 Contrast and forced colors | Met | `assistant-look`, `assistant-a11y` |
| 15 Narrow and short viewports | Met (safe areas: weak check) | `assistant-a11y`, `assistant-scope` |
| 16 Motion | Met | `assistant-look`, `assistant-next-step` |
| 17 Screen-reader structure | Met (announcements are a manual check) | `assistant-a11y`, `assistant-answers` |
| 18 Meal times | Met | `assistant-api`, `assistant-answers` |
| 19 Topic precedence | Met | `assistant-api` |
| 20 Strict scopes | Met | `assistant-api`, `assistant-next-step` |
| 21 Switcher accessibility | Met | `assistant-scope` |
| 22 Modality and focus | Met | `assistant-a11y`, `assistant-scope` |

## Verification

- `npx tsc --noEmit`: clean.
- Full `npm run test:e2e`: **423 passed, 1 failed** (424 total). The failure is the pre-existing `a-theme-visual` "signed in, light › cart looks as it did". It was already stale on `main`, because the local cart data grew (1440×1882 vs 1440×900). It is unrelated to this PR.
- `next build`: succeeds. It was built in a scratch copy, not in place. The only warning is the existing `metadataBase` one.
- Every batch was reviewed against the spec and the constitution, and each new test was shown failing before its fix.

## Known issues and follow-ups

- **Manual phone check not yet done.** There are 13 items in `tasks.md` T041 covering iPhone Safari with VoiceOver and Android Chrome with TalkBack: the scroll lock behind the sheet, that answers are announced once, the keyboard and the sheet, the scope menu with a screen reader, and a real IME.
- **Safe areas:** the app sets no `viewport-fit=cover`, so `env(safe-area-inset-*)` reads 0 on real devices. Tracked in `specs/BACKLOG.md`.
- **Pre-existing:** the user menu and the cart's add-item list don't `preventDefault` on Escape, so one Escape also closes an open assistant panel (backlog).
- **Pre-existing:** the stale `a-theme-visual` cart snapshot (backlog).
- **Possible follow-up:** combined recipe questions such as "¿Qué lleva y cómo se hace?" show only Preparación, because today's narrowing rule was kept on purpose (backlog).
- **Test note:** one test uses Next's `window.next.router` debugging handle for a direct recipe-to-recipe navigation. It is guarded so it fails clearly if Next removes the handle.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
