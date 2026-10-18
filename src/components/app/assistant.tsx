"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ChatAnswer, ChatMessage } from "@/components/shared/AssistantChat";
import { api } from "@/lib/client/api";

/** What the current page tells the floating assistant: its subtitle, starter questions and how to ask. */
export type AssistantPageContext = {
  subtitle: string;
  suggestions: string[];
  ask: (message: string) => Promise<ChatAnswer>;
};

const askRag = (message: string, scope: string, extra: Record<string, string> = {}) =>
  api("/api/rag/chat", { method: "POST", body: JSON.stringify({ message, scope, ...extra }) }) as Promise<ChatAnswer>;

const DEFAULT_CONTEXT: AssistantPageContext = {
  subtitle: "Sobre tus planes, recetas y compras",
  suggestions: ["¿Qué recetas hay en mi plan?", "¿Qué tengo en mi carrito?", "¿Qué ingredientes necesito comprar?"],
  ask: (message) => askRag(message, "auto")
};

const PageContextSetter = createContext<((context: AssistantPageContext | null) => void) | null>(null);
export const AssistantPageProvider = PageContextSetter.Provider;

// Lets a page swap the assistant's subtitle, suggestions and RAG scope while it is mounted.
export function useAssistantContext(context: AssistantPageContext) {
  const setContext = useContext(PageContextSetter);
  const askRef = useRef(context.ask);
  askRef.current = context.ask;
  const suggestionsKey = context.suggestions.join("\u0000");
  useEffect(() => {
    if (!setContext) return;
    setContext({ subtitle: context.subtitle, suggestions: suggestionsKey.split("\u0000"), ask: (message) => askRef.current(message) });
    return () => setContext(null);
  }, [setContext, context.subtitle, suggestionsKey]);
}

// State behind the single floating assistant the shell renders on every page.
export function useAssistantState() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<AssistantPageContext | null>(null);
  const context = page ?? DEFAULT_CONTEXT;
  const busyRef = useRef(false);

  const send = useCallback(async (text: string, ask: (message: string) => Promise<ChatAnswer>) => {
    const message = text.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text: message }]);
    try {
      const answer = await ask(message);
      setMessages((current) => [...current, { role: "assistant", text: answer.answer, sources: answer.sources }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "No pude responder en este momento. Intenta de nuevo." }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** Opens the assistant and asks within a specific RAG scope (used by the dashboard search bar). */
  const askInScope = useCallback(async (message: string, scope: string) => {
    setOpen(true);
    await send(message, (text) => askRag(text, scope));
  }, [send]);

  return { messages, busy, open, setOpen, context, setPage, send: (text: string) => send(text, context.ask), askInScope };
}

export { askRag };
