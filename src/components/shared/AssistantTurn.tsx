// The "Pensando…" loader is adapted from prompt-kit (https://github.com/ibelick/prompt-kit), MIT License
// Copyright (c) 2025 Julien Thibeaut
import { Bot, RotateCcw } from "lucide-react";
import { SCOPE_LABEL, type ChatAnswer, type Chip, type Rich, type ScopeKey } from "@/lib/assistant";
import { PromptSuggestion } from "./PromptSuggestion";

export type AssistantRequest = { message: string; scope: ScopeKey; recipeId?: string };

/** A chip: the text on the button and the request it sends (its own scope, and the recipe for an Esta receta chip). */
export type TurnChip = { label: string; request: AssistantRequest };

/** One entry of the conversation. The pending and the finished assistant turn of a request share one id, so React keeps the same element. */
export type Turn =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      request: AssistantRequest;
      status: "pending" | "answer" | "error";
      /** The page's starter questions as they were when the question was sent; a retry builds its chips from them. */
      suggestions: Chip[];
      answer?: ChatAnswer;
      chips?: TurnChip[];
    };

/** Suggestion chips: the starter questions of an empty thread or the next questions under the latest answer (REQ-5). */
export function ChipList({ chips, disabled, onAsk }: { chips: TurnChip[]; disabled: boolean; onAsk: (request: AssistantRequest) => void }) {
  return (
    <div className="assistant-chips">
      {chips.map((chip) => <PromptSuggestion key={chip.label} disabled={disabled} onClick={() => onAsk(chip.request)}>{chip.label}</PromptSuggestion>)}
    </div>
  );
}

export const ERROR_TEXT = "No pude responder en este momento.";

/** prompt-kit's text loader: the words blink between two theme colors (a static word under reduced motion, in CSS). */
function Loader({ text }: { text: string }) {
  return <span className="assistant-loader">{text}</span>;
}

/** Spans in order; a highlighted span is bold (weight 700, not color-only) so values stand out (REQ-2). */
function RichText({ rich }: { rich: Rich }) {
  return rich.map((span, index) => (span.highlight ? <strong key={index}>{span.text}</strong> : <span key={index}>{span.text}</span>));
}

/** The structured answer: lead, body, each section as an h3 and a list, then the sources line (REQ-2, REQ-3). Never the plain `answer`. */
function AnswerContent({ answer }: { answer: ChatAnswer }) {
  return (
    <>
      <p className="assistant-turn-lead"><RichText rich={answer.lead} /></p>
      {answer.body && <p>{answer.body}</p>}
      {answer.sections.map((section) => (
        <section key={section.title} className="assistant-turn-section">
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item, index) => <li key={index}><RichText rich={item} /></li>)}
          </ul>
        </section>
      ))}
      {answer.sources.length > 0 && <p className="assistant-turn-sources">Basado en: {answer.sources.join(", ")}</p>}
    </>
  );
}

// One turn of the conversation. The assistant turn keeps its live region mounted from the moment the request is sent, so
// a screen reader announces the answer when it lands; the label, the pending indicator and the chips stay outside the region.
export function AssistantTurn({
  turn,
  chipsAction,
  onRetry
}: {
  turn: Turn;
  chipsAction?: { disabled: boolean; onAsk: (request: AssistantRequest) => void };
  onRetry: (turn: Turn) => void;
}) {
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
        {turn.status === "answer" && turn.answer ? <AnswerContent answer={turn.answer} /> : turn.status === "error" ? <p>{ERROR_TEXT}</p> : null}
      </div>
      {pending && <div className="assistant-turn-pending"><Loader text="Pensando…" /></div>}
      {turn.status === "error" && (
        <button type="button" className="assistant-retry" onClick={() => onRetry(turn)}>
          <RotateCcw size={14} aria-hidden="true" /> Reintentar
        </button>
      )}
      {chipsAction && turn.chips && turn.chips.length > 0 && <ChipList chips={turn.chips} {...chipsAction} />}
    </article>
  );
}
