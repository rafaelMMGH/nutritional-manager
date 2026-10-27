// Adapted from prompt-kit (https://github.com/ibelick/prompt-kit), MIT License
// Copyright (c) 2025 Julien Thibeaut
"use client";

import { Button } from "@base-ui/react/button";

/** A suggested question: a pill button the user taps to ask it. Only prompt-kit's normal mode is kept; the highlight mode has no use here. */
export function PromptSuggestion({ className, ...props }: Button.Props) {
  return <Button className={className ? `assistant-suggestion ${className}` : "assistant-suggestion"} {...props} />;
}
