// Adapted from prompt-kit (https://github.com/ibelick/prompt-kit), MIT License
// Copyright (c) 2025 Julien Thibeaut
"use client";

import { useId, useLayoutEffect, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { COUNTER_FROM, MAX_MESSAGE, messageLength } from "@/lib/assistant";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import { Textarea } from "@/components/ui/textarea";

// Narrow screens and touch devices have no Shift key at hand: there Enter adds a newline and only Enviar sends.
const NEWLINE_ON_ENTER = "(max-width: 640px), (pointer: coarse)";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  /** Called with the raw draft when it may be sent: not blank, not over the limit and not `busy`. */
  onSubmit: (value: string) => void;
  /** A question is pending: the field stays editable, sending does not. */
  busy: boolean;
  placeholder: string;
  readOnly?: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Buttons that sit before Enviar (the mic). */
  children?: ReactNode;
};

// The composer: an autosizing textarea (5 lines, then it scrolls), the actions and Enviar. Unlike upstream it carries the
// length counter as the field's description and has no tooltips: the buttons keep their native `title`.
export function PromptInput({ value, onValueChange, onSubmit, busy, placeholder, readOnly, inputRef, children }: Props) {
  const counterId = useId();
  const newlineOnEnter = useMediaQuery(NEWLINE_ON_ENTER);
  const length = messageLength(value);
  const overLimit = length > MAX_MESSAGE;
  const showCounter = length >= COUNTER_FROM;
  const canSend = length > 0 && !overLimit && !busy;

  // Resize before paint: the height follows the content up to the CSS max-height, which is 5 lines.
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [inputRef, value, newlineOnEnter]);

  function submit() {
    if (canSend) onSubmit(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || newlineOnEnter) return;
    // Enter that confirms an IME candidate is not a send (keyCode 229 is the legacy signal for the same thing).
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  return (
    <div className="assistant-composer">
      <form className="assistant-chat-form" onSubmit={onFormSubmit}>
        <Textarea
          ref={inputRef}
          className="assistant-input"
          rows={1}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          readOnly={readOnly}
          aria-label="Pregunta"
          aria-describedby={showCounter ? counterId : undefined}
        />
        {children}
        <button type="submit" disabled={!canSend} aria-label="Enviar" title="Enviar"><ArrowUp size={18} /></button>
      </form>
      {showCounter && (
        <p id={counterId} className={overLimit ? "assistant-counter over" : "assistant-counter"}>
          <span>{length}/{MAX_MESSAGE}</span>
          {overLimit && <span> Máximo {MAX_MESSAGE} caracteres</span>}
        </p>
      )}
    </div>
  );
}
