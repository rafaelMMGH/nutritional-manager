import { Bot, Loader2 } from "lucide-react";
import { SCOPE_LABEL, type ChatAnswer, type ScopeKey } from "@/lib/assistant";

export type AssistantRequest = { message: string; scope: ScopeKey; recipeId?: string };

/** One entry of the conversation. The pending and the finished assistant turn of a request share one id, so React keeps the same element. */
export type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; request: AssistantRequest; status: "pending" | "answer" | "error"; answer?: ChatAnswer };

export const ERROR_TEXT = "No pude responder en este momento.";

// One turn of the conversation. The assistant turn keeps its live region mounted from the moment the request is sent, so
// a screen reader announces the answer when it lands; the label and the pending indicator stay outside the region.
export function AssistantTurn({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <article className="assistant-turn user" aria-label="Tú">
        <p>{turn.text}</p>
      </article>
    );
  }
  const pending = turn.status === "pending";
  return (
    <article className={pending ? "assistant-turn assistant is-pending" : "assistant-turn assistant"} aria-label="Asistente">
      <div className="assistant-turn-head">
        <Bot size={14} aria-hidden="true" />
        {turn.status !== "error" && <span className="assistant-turn-label">{SCOPE_LABEL[turn.request.scope]}</span>}
      </div>
      <div className="assistant-turn-live" aria-live="polite">
        {turn.status === "answer" ? turn.answer?.answer : turn.status === "error" ? ERROR_TEXT : null}
      </div>
      {pending && (
        <div className="assistant-turn-pending">
          <Loader2 size={16} className="spin" aria-hidden="true" /> Buscando…
        </div>
      )}
    </article>
  );
}
