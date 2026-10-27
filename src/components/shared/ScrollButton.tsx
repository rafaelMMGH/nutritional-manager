// Adapted from prompt-kit (https://github.com/ibelick/prompt-kit), MIT License
// Copyright (c) 2025 Julien Thibeaut
import { ChevronDown } from "lucide-react";

// prompt-kit's scroll button: a round chevron that fades in once the reader is away from the bottom. Unlike upstream it
// is driven by props (useChatScroll, not use-stick-to-bottom), is named, and is out of the tab order and the
// accessibility tree while hidden.
export function ScrollButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button type="button" className={visible ? "assistant-scroll visible" : "assistant-scroll"} onClick={onClick} aria-label="Ir al último mensaje" title="Ir al último mensaje" inert={!visible}>
      <ChevronDown size={20} aria-hidden="true" />
    </button>
  );
}
