"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageSquarePlus, Mic, Square, X } from "lucide-react";
import { AssistantTurn, ChipList, type AssistantRequest, type Turn, type TurnChip } from "./AssistantTurn";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import { PromptInput } from "./PromptInput";
import { ScrollButton } from "./ScrollButton";
import { useChatScroll } from "./useChatScroll";
import { useDictation } from "./useDictation";
import "./assistant-chat.css";

// Same breakpoint as the sheet rules in assistant-chat.css.
const SHEET = "(max-width: 640px)";

type Props = {
  title?: string;
  subtitle: string;
  suggestions?: TurnChip[];
  turns: Turn[];
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (message: string) => void;
  onSuggest: (request: AssistantRequest) => void;
  onRetry: (turn: Turn) => void;
  /** Nueva conversación: empties the thread and drops any pending answer. */
  onClear: () => void;
};

// Floating chat over the RAG endpoint: a FAB in the bottom-right corner opens the panel (kept mounted so the
// conversation survives closing it). Suggestion chips when empty, one article per turn, pill composer with dictation.
export function AssistantChat({ title = "Asistente", subtitle, suggestions = [], turns, busy, open, onOpenChange, onSend, onSuggest, onRetry, onClear }: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dictation = useDictation(setDraft);
  const sheet = useMediaQuery(SHEET);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    onOpenChange(false);
    fabRef.current?.focus();
  }

  const { logRef, atBottom, scrollToBottom } = useChatScroll(turns);

  function jumpToLast() {
    scrollToBottom();
    inputRef.current?.focus();
  }

  function startOver() {
    dictation.stop();
    onClear();
    inputRef.current?.focus();
  }

  // Chips sit under the latest finished answer. An error as the latest finished turn hides them, and so does a pending
  // retry (it stands in for its error turn); a pending new question keeps them on screen, disabled.
  const latest = turns.findLast((turn) => turn.role === "assistant" && turn.status !== "pending");
  const lastAssistant = turns.findLast((turn) => turn.role === "assistant");
  const retrying = lastAssistant?.role === "assistant" && lastAssistant.status === "pending" && lastAssistant.retrying;
  const chipsTurnId = !retrying && latest?.role === "assistant" && latest.status === "answer" ? latest.id : null;
  const askChip = (request: AssistantRequest) => {
    dictation.stop();
    onSuggest(request);
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
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {turns.length > 0 && (
            <button type="button" className="assistant-chat-new" onClick={startOver}>
              <MessageSquarePlus size={16} aria-hidden="true" /> Nueva conversación
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
            {turns.map((turn) => <AssistantTurn key={turn.id} turn={turn} chipsAction={turn.id === chipsTurnId ? { disabled: busy, onAsk: askChip } : undefined} onRetry={turn.id === lastAssistant?.id ? onRetry : undefined} />)}
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
