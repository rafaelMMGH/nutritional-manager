"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Loader2, Mic, Square, X } from "lucide-react";
import { AssistantTurn, ChipList, type AssistantRequest, type Turn, type TurnChip } from "./AssistantTurn";
import { useDictation } from "./useDictation";
import "./assistant-chat.css";

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
};

// Floating chat over the RAG endpoint: a FAB in the bottom-right corner opens the panel (kept mounted so the
// conversation survives closing it). Suggestion chips when empty, one article per turn, pill composer with dictation.
export function AssistantChat({ title = "Asistente", subtitle, suggestions = [], turns, busy, open, onOpenChange, onSend, onSuggest, onRetry }: Props) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const dictation = useDictation(setDraft);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    dictation.stop();
    onOpenChange(false);
    fabRef.current?.focus();
  }

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // Chips sit under the latest finished answer. An error as the latest finished turn hides them; a pending request keeps
  // them on screen, disabled.
  const latest = turns.findLast((turn) => turn.role === "assistant" && turn.status !== "pending");
  const chipsTurnId = latest?.role === "assistant" && latest.status === "answer" ? latest.id : null;
  const askChip = (request: AssistantRequest) => {
    dictation.stop();
    onSuggest(request);
  };

  function ask(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    dictation.stop();
    setDraft("");
    onSend(message);
  }

  const placeholder = dictation.listening
    ? "Escuchando… toca ■ para terminar"
    : dictation.transcribing
      ? dictation.download != null ? `Descargando modelo de voz… ${dictation.download}%` : "Transcribiendo…"
      : "Escribe tu pregunta";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(draft);
  }

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
      <aside id="assistant-chat-panel" className={open ? "assistant-chat open" : "assistant-chat"} aria-label={title} aria-hidden={!open} inert={!open}>
        <header>
          <span className="assistant-chat-icon"><Bot size={20} /></span>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="assistant-chat-close" onClick={close} aria-label="Cerrar asistente"><X size={18} /></button>
        </header>
        <div className="assistant-chat-log" ref={logRef}>
          {turns.length === 0 && (
            <div className="assistant-chat-empty">
              <p>Pregúntame lo que quieras saber. Respondo con la información de tus planes.</p>
              <ChipList chips={suggestions} disabled={busy} onAsk={askChip} />
            </div>
          )}
          {turns.map((turn) => <AssistantTurn key={turn.id} turn={turn} chipsAction={turn.id === chipsTurnId ? { disabled: busy, onAsk: askChip } : undefined} onRetry={onRetry} />)}
        </div>
        {dictation.error && <p className="assistant-chat-error" role="alert">{dictation.error}</p>}
        <form className="assistant-chat-form" onSubmit={submit}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            readOnly={dictation.transcribing}
            aria-label="Pregunta"
          />
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
          <button type="submit" disabled={!draft.trim() || busy} aria-label="Enviar"><ArrowUp size={18} /></button>
        </form>
      </aside>
    </>
  );
}
