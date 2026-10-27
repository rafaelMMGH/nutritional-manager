"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Loader2, Mic, Square, X } from "lucide-react";
import { useDictation } from "./useDictation";
import "./assistant-chat.css";

export type ChatAnswer = { answer: string; context_used: string; sources: string[] };
export type ChatMessage = { role: "user" | "assistant"; text: string; sources?: string[] };

type Props = {
  title?: string;
  subtitle: string;
  suggestions?: string[];
  messages: ChatMessage[];
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (message: string) => void;
};

// Floating chat over the RAG endpoint: a FAB in the bottom-right corner opens the panel (kept mounted so the
// conversation survives closing it). Suggestion chips when empty, bubbles with their sources, pill composer with dictation.
export function AssistantChat({ title = "Asistente", subtitle, suggestions = [], messages, busy, open, onOpenChange, onSend }: Props) {
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
  }, [messages, busy]);

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
        <div className="assistant-chat-log" ref={logRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="assistant-chat-empty">
              <p>Pregúntame lo que quieras saber. Respondo con la información de tus planes.</p>
              <div className="assistant-chat-suggestions">
                {suggestions.map((item) => <button key={item} type="button" className="assistant-suggestion" onClick={() => ask(item)}>{item}</button>)}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`assistant-bubble ${message.role}`}>
              <p>{message.text}</p>
              {message.sources && message.sources.length > 0 && (
                <div className="assistant-sources">{message.sources.map((source) => <span key={source}>{source}</span>)}</div>
              )}
            </div>
          ))}
          {busy && <div className="assistant-bubble assistant typing"><Loader2 size={16} className="spin" /> Buscando…</div>}
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
