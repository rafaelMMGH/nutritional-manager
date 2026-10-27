"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AssistantRequest, Turn, TurnChip } from "@/components/shared/AssistantTurn";
import { api } from "@/lib/client/api";
import { dashboardSuggestions, normalizeText, type ChatAnswer, type Chip, type ScopeKey } from "@/lib/assistant";

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

const chipOf = ({ text, scope, recipeId }: Chip): TurnChip => ({ label: text, request: { message: text, scope, ...(recipeId ? { recipeId } : {}) } });

/**
 * The chips under an answer (REQ-5), from its kind: the topic's follow-ups, the first 3 page suggestions for an unknown
 * reply, "Preguntar en Todo" plus the first 2 for an out-of-scope one, or the first 3 dashboard suggestions for a missing
 * recipe. A candidate that repeats the question just asked is skipped and the next one of the full list fills the slot.
 * `suggestions` are the page's, as they were when the question was sent.
 */
export function chipsFor(answer: ChatAnswer, request: AssistantRequest, suggestions: Chip[]): TurnChip[] {
  const asked = normalizeText(request.message);
  const fresh = (list: Chip[], count = list.length) => list.filter((chip) => normalizeText(chip.text) !== asked).slice(0, count).map(chipOf);
  switch (answer.kind) {
    case "answer":
    case "overview":
      // A follow-up in "Receta" is about the recipe this question was about.
      return fresh(answer.follow_ups.map(({ text, scope }) => ({ text, scope, ...(scope === "Receta" && request.recipeId ? { recipeId: request.recipeId } : {}) })));
    case "unknown":
      return fresh(suggestions, 3);
    case "out_of_scope":
      return [{ label: "Preguntar en Todo", request: { message: request.message, scope: "auto" } }, ...fresh(suggestions, 2)];
    case "missing_recipe":
      return fresh(dashboardSuggestions(), 3);
  }
}

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
    setContext?.(JSON.parse(key));
  }, [setContext, key]);
  // Only leaving the page clears the context, so editing it in place (e.g. a renamed subtitle) keeps the chosen scope.
  useEffect(() => () => setContext?.(null), [setContext]);
}

// State behind the single floating assistant the shell renders on every page.
export function useAssistantState() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [page, setPageContext] = useState<AssistantPageContext | null>(null);
  const [scope, setScope] = useState<ScopeKey>(DEFAULT_CONTEXT.defaultScope);
  const context = page ?? DEFAULT_CONTEXT;
  const pageRef = useRef<AssistantPageContext | null>(null);
  const busyRef = useRef(false);
  const nextId = useRef(0);

  // Navigating keeps the thread but puts the scope back to the new page's default (REQ-12). A change that keeps the page's
  // default scope and recipe (e.g. a renamed subtitle) leaves the user's chosen scope alone.
  const setPage = useCallback((next: AssistantPageContext | null) => {
    const before = pageRef.current ?? DEFAULT_CONTEXT;
    const after = next ?? DEFAULT_CONTEXT;
    pageRef.current = next;
    setPageContext(next);
    if (before.defaultScope !== after.defaultScope || before.recipeId !== after.recipeId) setScope(after.defaultScope);
  }, []);

  /** Sends one question in `request.scope`. The pending turn and its result share an id (REQ-17). */
  const send = useCallback(async (request: AssistantRequest) => {
    const message = request.message.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const id = `turn-${nextId.current++}`;
    const sent = { ...request, message };
    // Frozen now: the chips under the answer come from the page the question was asked on, not the one open when it lands.
    const suggestions = (pageRef.current ?? DEFAULT_CONTEXT).suggestions;
    setTurns((current) => [...current, { id: `${id}-user`, role: "user", text: message }, { id, role: "assistant", request: sent, status: "pending" }]);
    const settle = (turn: Turn) => setTurns((current) => current.map((entry) => (entry.id === id ? turn : entry)));
    try {
      const answer = await askRag(sent);
      settle({ id, role: "assistant", request: sent, status: "answer", answer, chips: chipsFor(answer, sent, suggestions) });
    } catch (error) {
      console.warn("Assistant request failed", { scope: sent.scope, error });
      settle({ id, role: "assistant", request: sent, status: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const sendTyped = useCallback((text: string) => send({ message: text, scope, ...(scope === "Receta" && context.recipeId ? { recipeId: context.recipeId } : {}) }), [send, scope, context.recipeId]);
  const suggestions = context.suggestions.map(chipOf);

  /** Opens the assistant and asks within a specific scope (used by the dashboard search bar). */
  const askInScope = useCallback(async (message: string, askedScope: ScopeKey) => {
    setOpen(true);
    await send({ message, scope: askedScope });
  }, [send]);

  return { turns, busy, open, setOpen, context, scope, setScope, setPage, suggestions, send: sendTyped, sendRequest: send, askInScope };
}
