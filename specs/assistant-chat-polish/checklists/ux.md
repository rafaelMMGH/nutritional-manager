# Checklist: UX and accessibility for assistant-chat-polish

Requirement-quality checks ("unit tests for English"). Each item checks whether the **spec** is complete, clear, and measurable, not whether the code works. Unchecked items block spec approval. Gap IDs (G#) for open items are listed at the end with severity and a suggested fix.

Checked against spec v1.3 (REQ-1 to REQ-22). Re-check of the v1.2 checklist (60 items): the last open gap (G32) is resolved. 60 items: 60 pass, 0 gaps.

## States

- [x] Is the empty state content defined (copy, how many page suggestion chips, which ones per page)? [REQ-9, REQ-5 "empty state: all page suggestions", page-suggestions table]
- [x] Is the thinking indicator specified (copy, position, removed on answer or error)? [REQ-7]
- [x] Is the loading state bounded for a slow or never-answering request (timeout leading to the error state)? [REQ-8: 15 s, late answer discarded, Given/When/Then]
- [x] Is the failed-turn state specified (copy, kept question, Reintentar, retry fails again, one copy of the question)? [REQ-8]
- [x] Are error variants and Reintentar while in flight defined? [REQ-8: network, non-2xx and timeout share one error; during retry the error turn is replaced by "Pensando…"]
- [x] Is the unknown-question reply specified as a non-error with three parts, scope label, and a Given/When/Then? [REQ-6]
- [x] Do the empty-cart, missing-plan and no-recipes cases have a Given/When/Then? [REQ-1 (empty cart, no plan, no recipes), REQ-18 (no plan, no times)]
- [x] Is "long answers" and "many messages" measurable? [REQ-1 cap of 8 items plus "y <n> más" with 40-item Given/When/Then, Layout (80% bubble, wrap, no cap), REQ-15 long-token Given/When/Then]
- [x] Is stick-to-bottom precise (24 px tolerance, send always scrolls, long answer positioning)? [REQ-11, Decisions "Long answers"]
- [x] Is a rapid double send or chip click while pending defined as a single request? [Edge cases, REQ-5, REQ-10]

## Keyboard and focus

- [x] Is Escape closing the panel, and focus return to the FAB, specified? [REQ-22]
- [x] Is focus on open defined, and is the panel modal or non-modal? [REQ-22: input on open; desktop non-modal; sheet at ≤640 px modal with Tab containment]
- [x] Is Escape precedence defined when a nested widget is open? [REQ-22: scope menu first, then panel, with Given/When/Then]
- [x] Is focus after Nueva conversación specified (input) and the button's absence on an empty thread? [REQ-9]
- [x] Is the scope switcher's widget pattern, accessible name, keyboard operation, selected-state exposure and focus after a change specified? [REQ-21: named group "Alcance", arrows, Enter/Space, focus stays; Given/When/Then]
- [x] Is focus continuity defined when the focused control disappears (chip, Reintentar, "Ir al último mensaje")? [Interaction details "Focus"]
- [x] Are Enter, Shift+Enter and disabled-send rules specified and testable? [REQ-10]
- [x] Is Enter defined for touch keyboards and for IME composition? [REQ-10: ≤640 px Enter = newline, no send during composition, Given/When/Then each]
- [x] Is panel and focus behavior defined when a search-bar question opens the panel? [REQ-13: input focused, bar disabled while pending, no submit over 500]

## Screen reader

- [x] Does the live region cover answers, the unknown reply and errors, and exclude the thinking indicator, with a Given/Then? [REQ-17]
- [x] Is the announced content fully defined (long answers, Reintentar placement)? [REQ-17: each assistant turn in full; error text in region, Reintentar a focusable control after it and outside; long lists bounded by the 8-item cap in REQ-1] (was G13)
- [x] Are semantics of a structured answer defined (heading level, list markup, emphasis beyond color, decorative icon, speaker)? [REQ-2, REQ-17 (speaker "Tú"/"Asistente" and hidden icon now have a Given/Then)]
- [x] Are existing accessible names kept (FAB open/close, labelled input and send, dictation alert)? [REQ-10, REQ-17]

## Reduced motion

- [x] Is the reduced-motion behavior specified and assertable (instant scroll, static loader, no animation)? [REQ-16 computed-style and scroll-position Given/When/Then, Interaction details "Motion"]
- [x] Is the fade-in bounded with a number (≤ 200 ms)? [REQ-16, NFR]
- [x] Are the other motions covered (panel or sheet, scroll button, chips), the static loader defined, and non-reduced scrolling defined? [Interaction details "Motion", REQ-16]

## Touch targets and narrow screens

- [x] Are the breakpoint (≤ 640 px), the 44×44 minimum and a 360×740 test viewport given? [REQ-15]
- [x] Is the 44×44 control list complete, with no overlap? [Interaction details "Touch targets" (includes compact menu options); REQ-15 no-overlap Given/When/Then]
- [x] Is the narrow header layout defined and how the sheet closes on touch? [Interaction details "Narrow header", REQ-22 visible "Cerrar asistente" ×]
- [x] Are the keyboard-avoidance edges testable (safe-area insets, landscape, keyboard emulation, page scroll behind)? [REQ-15: computed padding ≥ `env(safe-area-inset-*)`, 740×360 on its own line, visualViewport Given/When/Then; REQ-22 scroll lock] (was G18)

## Contrast (light and dark)

- [x] Is the dark contrast rule referenced to an e2e zero-violation check? [REQ-14]
- [x] Is the audited element list complete and measurable? [Interaction details "Contrast": now includes counter and over-limit, ×, Nueva conversación, Reintentar, compact button and menu, modal backdrop, scroll button, focus rings; REQ-14 AA 4.5:1 and 3:1] (was G30)
- [x] Are highlights and the selected scope required to differ by more than color and survive forced colors, computably? [REQ-2 (font-weight ≥600 or underline), REQ-14 forced-colors Given/Then]

## Spanish copy

- [x] Are the core strings given verbatim? [Interaction details "Copy"]
- [x] Is "Carrito actual" vs "Carrito" naming reconciled? [REQ-4, Decisions]
- [x] Is the register consistent (tuteo)? [REQ-1, REQ-6, REQ-18, Interaction details]
- [x] Is copy defined for new controls and states (switcher label, narrow button, "Preguntar en Todo", empty and no-plan leads, counter, "Máximo 500 caracteres", "y <n> más", ×, per-page suggestions)? [Interaction details "Copy", page-suggestions table]
- [x] Are keyword rules unambiguous (normalization, exhaustive vocabulary, stems, plural, tiers, tie order, "cuándo", word definition)? [REQ-19, Topics table, Terms, Given/When/Then set]

## Discoverability and next steps

- [x] Is the switcher always visible with a per-page default, and does each answer carry its scope label? [REQ-4, REQ-12, REQ-21]
- [x] Do follow-ups appear only under the latest answer, with fixed texts per topic, and fall back to page suggestions? [REQ-5, Topics table]
- [x] Are chip counts consistent, and are chips after a failed turn and repeats defined? [REQ-5: one list per case, repeat rule filling from the full source list, minimum 2, none on error, missing-recipe chips]
- [x] Does the unknown reply stay accurate in a narrowed scope? [REQ-20: out-of-scope winner gets "Preguntar en Todo" plus two suggestions]
- [x] Are the textarea limits numeric and complete? [REQ-10: 5 lines, 500 characters, counter from 450, over-limit behavior, blank rejected by server]

## Added for v1.1

- [x] Does Nueva conversación during a pending request discard the late answer and re-enable send, with a Given/When/Then? [REQ-9]
- [x] Is the server-side 500-character limit specified with the response and boundary cases (501 rejected, 500 plus spaces accepted)? [REQ-10, Decisions]
- [x] Is the character-count basis the same on client and server? [Terms "Length": trimmed, UTF-16 code units; REQ-10 boundary Given/When/Then on client and direct request; REQ-13 bar] (was G26)
- [x] Is the counter exposed to assistive tech and is the over-limit state distinct by more than color? [REQ-10: field's accessible description, outside live region, over 500 adds "Máximo 500 caracteres"] (was G27)
- [x] Is the modal sheet specified (inert page, no scroll, Tab containment, visible ×, Escape order, testable Given/When/Then)? [REQ-22]
- [x] Is the compact scope menu's pattern defined (role, arrow-key movement, Escape, focus on open and after close)? [REQ-21: button plus listbox popup, expanded state, focus selected option on open, arrows, Enter/Space, Escape, focus returns to button; two Given/When/Then] (was G28)
- [x] Are page suggestions tagged with a scope and is the chip's scope shown on its answer, with Given/When/Then for each page type? [Page-suggestions table, REQ-4, REQ-5]
- [x] Is the strict-scope unknown reply specified (chips, "Preguntar en Todo" re-append, switcher unchanged, narrowed overviews per scope, missing recipe)? [REQ-20]
- [x] Is a scope change while a request is pending defined (applies to the next question only)? [REQ-12 Given/When/Then]
- [x] Are the topic follow-up chip texts defined and constrained to resolve in their own scope? [Topics table, REQ-5 invariant plus Given/When/Then] (was G29)
- [x] Is forced-colors behavior assertable? [REQ-14 Given/When/Then with emulation]
- [x] Does the empty Recetario overview ("Aún no tienes recetas.") have a Given/When/Then? [REQ-1] (was G31)

## Added for v1.2

- [x] Are list caps measurable and is the overflow item announced consistently with the cap? [REQ-1: 8 items, last item "y <n> más", 40-ingredient Given/When/Then; Decisions on announcing the full turn]
- [x] Is the FAB hidden while the sheet is open, with focus returning to a visible FAB on close? [REQ-15 (hidden at ≤640 px, Given 360×740), REQ-22 (focus to FAB on close)]
- [x] Does the search bar enforce the 500-character limit with a testable case? [REQ-13: no submit over 500, Given length 501]
- [x] Is the touch focus-to-answer rule complete (error outcome, focus during the pending wait, how a non-interactive turn takes focus)? [REQ-22 (log while pending, then the new turn, error turn not in tab order, Reintentar next; 360 px failed-chip Given/When/Then), REQ-17 (script-focused turn not in tab order, no extra announcement), Interaction details "Focus"] (was G32)

## Gaps

| ID | Severity | REQ | Gap | Suggested fix |
|----|----------|-----|-----|---------------|
| none | | | | |

Resolved in v1.3: G32. Resolved in v1.2: G13, G18, G26, G27, G28, G29, G30, G31. Resolved from v1.0: G1 to G12, G14 to G17, G19 to G25.

## Product questions

None.
