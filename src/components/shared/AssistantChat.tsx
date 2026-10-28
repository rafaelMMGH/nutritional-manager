"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageSquarePlus, Mic, Square, X } from "lucide-react";
import { AssistantTurn, ChipList, type AssistantRequest, type Turn, type TurnChip } from "./AssistantTurn";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import { PromptInput } from "./PromptInput";
import { ScopeSwitcher } from "./ScopeSwitcher";
import { ScrollButton } from "./ScrollButton";
import { useChatScroll } from "./useChatScroll";
import { useDictation } from "./useDictation";
import type { ScopeKey } from "@/lib/assistant";
import "./assistant-chat.css";

// Same breakpoint as the sheet rules in assistant-chat.css.
export const SHEET_QUERY = "(max-width: 640px)";

type Props = {
  title?: string;
  subtitle: string;
  suggestions?: TurnChip[];
  turns: Turn[];
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the next typed question is asked, and whether the page is a recipe (which adds "Esta receta"). */
  scope: ScopeKey;
  recipe: boolean;
  onScopeChange: (scope: ScopeKey) => void;
  /** Changes whenever something outside the panel (the dashboard search bar) asks, so the input takes focus even if the panel is already open. */
  focusRequest: number;
  onSend: (message: string) => void;
  onSuggest: (request: AssistantRequest) => void;
  onRetry: (turn: Turn) => void;
  /** Nueva conversación: empties the thread and drops any pending answer. */
  onClear: () => void;
};

// Floating chat over the RAG endpoint: a FAB in the bottom-right corner opens the panel (kept mounted so the
// conversation survives closing it). Suggestion chips when empty, one article per turn, pill composer with dictation.
export function AssistantChat({ title = "Asistente", subtitle, suggestions = [], turns, busy, open, onOpenChange, scope, recipe, onScopeChange, focusRequest, onSend, onSuggest, onRetry, onClear }: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dictation = useDictation(setDraft);
  const sheet = useMediaQuery(SHEET_QUERY);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, focusRequest]);

  // Escape closes the panel; a popup inside it (the compact scope menu) takes Escape first by calling preventDefault.
  // In the modal sheet Tab wraps, because inert on the page alone lets focus escape to the browser's own controls.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") close();
      else if (event.key === "Tab" && sheet) wrapTab(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sheet]);

  // The FAB is `display: none` while the sheet is open, so it can take focus only after the closing render.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    fabRef.current?.focus();
  }, [open]);

  // The sheet follows the visual viewport, so the on-screen keyboard shrinks it instead of covering the composer.
  // The vars only matter at ≤640 px (the CSS falls back to the full viewport without them).
  useEffect(() => {
    const panel = panelRef.current;
    const viewport = window.visualViewport;
    if (!open || !panel || !viewport) return;
    const follow = () => {
      panel.style.setProperty("--vv-height", `${viewport.height}px`);
      panel.style.setProperty("--vv-top", `${viewport.offsetTop}px`);
    };
    follow();
    viewport.addEventListener("resize", follow);
    viewport.addEventListener("scroll", follow);
    return () => {
      viewport.removeEventListener("resize", follow);
      viewport.removeEventListener("scroll", follow);
      panel.style.removeProperty("--vv-height");
      panel.style.removeProperty("--vv-top");
    };
  }, [open]);

  function close() {
    dictation.stop();
    returnFocus.current = true;
    onOpenChange(false);
  }

  function wrapTab(event: KeyboardEvent) {
    const panel = panelRef.current;
    if (!panel) return;
    // Only what Tab can really land on: not the display:none switcher variant, not roving tabindex="-1" options, not disabled or hidden.
    const stops = [...panel.querySelectorAll<HTMLElement>("button, textarea, input, a[href], [tabindex]")].filter(
      (node) =>
        node.tabIndex >= 0 &&
        !node.matches(":disabled") &&
        !node.closest("[inert]") &&
        node.getClientRects().length > 0 &&
        getComputedStyle(node).visibility !== "hidden"
    );
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first?.focus();
    }
  }

  const { logRef, atBottom, scrollToBottom } = useChatScroll(turns);

  function jumpToLast() {
    scrollToBottom();
    inputRef.current?.focus();
  }

  function startOver() {
    dictation.stop();
    followTurn.current = false;
    onClear();
    inputRef.current?.focus();
  }

  // Chips sit under the latest finished answer. An error as the latest finished turn hides them, and so does a pending
  // retry (it stands in for its error turn); a pending new question keeps them on screen, disabled.
  const latest = turns.findLast((turn) => turn.role === "assistant" && turn.status !== "pending");
  const lastAssistant = turns.findLast((turn) => turn.role === "assistant");
  const retrying = lastAssistant?.role === "assistant" && lastAssistant.status === "pending" && lastAssistant.retrying;
  const chipsTurnId = !retrying && latest?.role === "assistant" && latest.status === "answer" ? latest.id : null;

  // A chip or Reintentar disappears or turns disabled once the request is sent, which would drop focus on <body>. Desktop
  // goes to the input. The sheet keeps the on-screen keyboard down: focus waits on the log, then moves to the new turn
  // (REQ-22), unless the user has moved it somewhere else meanwhile.
  const followTurn = useRef(false);
  function keepFocus() {
    if (sheet) {
      followTurn.current = true;
      logRef.current?.focus({ preventScroll: true });
    } else {
      inputRef.current?.focus();
    }
  }
  useEffect(() => {
    if (!followTurn.current) return;
    const last = turns.findLast((turn) => turn.role === "assistant");
    if (last?.role === "assistant" && last.status === "pending") return;
    followTurn.current = false;
    const log = logRef.current;
    if (last && log && document.activeElement === log && log.lastElementChild instanceof HTMLElement) log.lastElementChild.focus({ preventScroll: true });
  }, [turns]);

  const askChip = (request: AssistantRequest) => {
    dictation.stop();
    onSuggest(request);
    keepFocus();
  };
  const retry = (turn: Turn) => {
    onRetry(turn);
    keepFocus();
  };

  function ask(text: string) {
    dictation.stop();
    setDraft("");
    onSend(text.trim());
  }

  const placeholder = dictation.listening
    ? "Escuchando… toca ■ para terminar"
    : dictation.transcribing
      ? dictation.download != null ? `Descargando modelo de voz… ${dictation.download}%` : "Transcribiendo…"
      : "Escribe tu pregunta";

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={open ? "assistant-fab open" : "assistant-fab"}
        onClick={() => (open ? close() : onOpenChange(true))}
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
        aria-expanded={open}
        aria-controls="assistant-chat-panel"
      >
        {open ? <X size={24} /> : <Bot size={26} />}
      </button>
      {open && sheet && <div className="assistant-chat-backdrop" aria-hidden="true" />}
      <aside ref={panelRef} id="assistant-chat-panel" className={open ? "assistant-chat open" : "assistant-chat"} aria-label={title} aria-hidden={!open} inert={!open}>
        <header>
          <span className="assistant-chat-icon"><Bot size={20} /></span>
          <div className="assistant-chat-heading">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <ScopeSwitcher value={scope} onChange={onScopeChange} recipe={recipe} sheet={sheet} />
          {turns.length > 0 && (
            <button type="button" className="assistant-chat-new" onClick={startOver} aria-label="Nueva conversación" title="Nueva conversación">
              <MessageSquarePlus size={16} aria-hidden="true" /> <span>Nueva conversación</span>
            </button>
          )}
          <button type="button" className="assistant-chat-close" onClick={close} aria-label="Cerrar asistente"><X size={18} /></button>
        </header>
        <div className="assistant-chat-body">
          <div className="assistant-chat-log" ref={logRef} tabIndex={-1}>
            {turns.length === 0 && (
              <div className="assistant-chat-empty">
                <p>Pregúntame lo que quieras saber. Respondo con la información de tus planes.</p>
                <ChipList chips={suggestions} disabled={busy} onAsk={askChip} />
              </div>
            )}
            {turns.map((turn) => <AssistantTurn key={turn.id} turn={turn} chipsAction={turn.id === chipsTurnId ? { disabled: busy, onAsk: askChip } : undefined} onRetry={turn.id === lastAssistant?.id ? retry : undefined} />)}
          </div>
          <ScrollButton visible={!atBottom} onClick={jumpToLast} />
        </div>
        {dictation.error && <p className="assistant-chat-error" role="alert">{dictation.error}</p>}
        <PromptInput value={draft} onValueChange={setDraft} onSubmit={ask} busy={busy} placeholder={placeholder} readOnly={dictation.transcribing} inputRef={inputRef}>
          {dictation.supported && (
            <button
              type="button"
              className={dictation.listening ? "assistant-mic listening" : "assistant-mic"}
              disabled={dictation.transcribing}
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start(draft))}
              aria-label={dictation.listening ? "Detener dictado" : "Dictar pregunta"}
              aria-pressed={dictation.listening}
              title={dictation.listening ? "Detener dictado" : "Dictar pregunta"}
            >
              {dictation.transcribing ? <Loader2 size={18} className="spin" /> : dictation.listening ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}
            </button>
          )}
        </PromptInput>
      </aside>
    </>
  );
}
