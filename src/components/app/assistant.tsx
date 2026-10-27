"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AssistantRequest, Turn } from "@/components/shared/AssistantTurn";
import { api } from "@/lib/client/api";
import { dashboardSuggestions, type ChatAnswer, type Chip, type ScopeKey } from "@/lib/assistant";

/** What the current page tells the floating assistant: its subtitle, the scope it asks in by default and its starter questions. */
export type AssistantPageContext = {
  subtitle: string;
  defaultScope: ScopeKey;
  /** The recipe a "Receta" question is about. */
  recipeId?: string;
  suggestions: Chip[];
};

const askRag = ({ message, scope, recipeId }: AssistantRequest) =>
  api("/api/rag/chat", { method: "POST", body: JSON.stringify({ message, scope, ...(recipeId ? { recipe_id: recipeId } : {}) }) }) as Promise<ChatAnswer>;

const DEFAULT_CONTEXT: AssistantPageContext = {
  subtitle: "Sobre tus planes, recetas y compras",
  defaultScope: "auto",
  suggestions: dashboardSuggestions()
};

const PageContextSetter = createContext<((context: AssistantPageContext | null) => void) | null>(null);
export const AssistantPageProvider = PageContextSetter.Provider;

// Lets a page swap the assistant's subtitle, starter questions and default scope while it is mounted. The context is plain data.
export function useAssistantContext(context: AssistantPageContext) {
  const setContext = useContext(PageContextSetter);
  const key = JSON.stringify(context);
  useEffect(() => {
    if (!setContext) return;
    setContext(JSON.parse(key));
    return () => setContext(null);
  }, [setContext, key]);
}

// State behind the single floating assistant the shell renders on every page.
export function useAssistantState() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [page, setPageContext] = useState<AssistantPageContext | null>(null);
  const [scope, setScope] = useState<ScopeKey>(DEFAULT_CONTEXT.defaultScope);
  const context = page ?? DEFAULT_CONTEXT;
  const busyRef = useRef(false);
  const nextId = useRef(0);

  // Navigating keeps the thread but puts the scope back to the new page's default (REQ-12).
  const setPage = useCallback((next: AssistantPageContext | null) => {
    setPageContext(next);
    setScope((next ?? DEFAULT_CONTEXT).defaultScope);
  }, []);

  /** Sends one question in `request.scope`. The pending turn and its result share an id (REQ-17). */
  const send = useCallback(async (request: AssistantRequest) => {
    const message = request.message.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const id = `turn-${nextId.current++}`;
    const sent = { ...request, message };
    setTurns((current) => [...current, { id: `${id}-user`, role: "user", text: message }, { id, role: "assistant", request: sent, status: "pending" }]);
    const settle = (turn: Turn) => setTurns((current) => current.map((entry) => (entry.id === id ? turn : entry)));
    try {
      settle({ id, role: "assistant", request: sent, status: "answer", answer: await askRag(sent) });
    } catch (error) {
      console.warn("Assistant request failed", { scope: sent.scope, error });
      settle({ id, role: "assistant", request: sent, status: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const sendTyped = useCallback((text: string) => send({ message: text, scope, ...(scope === "Receta" && context.recipeId ? { recipeId: context.recipeId } : {}) }), [send, scope, context.recipeId]);
  const sendChip = useCallback((chip: Chip) => send({ message: chip.text, scope: chip.scope, ...(chip.recipeId ? { recipeId: chip.recipeId } : {}) }), [send]);

  /** Opens the assistant and asks within a specific scope (used by the dashboard search bar). */
  const askInScope = useCallback(async (message: string, askedScope: ScopeKey) => {
    setOpen(true);
    await send({ message, scope: askedScope });
  }, [send]);

  return { turns, busy, open, setOpen, context, scope, setScope, setPage, send: sendTyped, sendChip, askInScope };
}
