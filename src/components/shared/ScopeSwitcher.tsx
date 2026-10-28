"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check, ChevronDown } from "lucide-react";
import { SCOPE_LABEL, type ScopeKey } from "@/lib/assistant";

const PAGE_SCOPES: ScopeKey[] = ["auto", "Plan activo", "Recetario", "Carrito"];

type Props = {
  value: ScopeKey;
  onChange: (scope: ScopeKey) => void;
  /** A recipe page also offers "Esta receta". */
  recipe: boolean;
  /** Whether the compact button shows (the sheet's media query); crossing it closes an open menu. */
  sheet: boolean;
};

// Where the next question is asked (REQ-12). Both variants are rendered and the CSS shows one: a segmented group on
// desktop and a button with a listbox popup at ≤640 px (REQ-21). The hidden one is `display: none`, so it is neither
// read nor reachable. The selected option carries a border and a check, never color alone.
export function ScopeSwitcher({ value, onChange, recipe, sheet }: Props) {
  const scopes = recipe ? [...PAGE_SCOPES, "Receta" as const] : PAGE_SCOPES;
  return (
    <>
      <ToggleGroup
        className="assistant-scope-group"
        aria-label="Alcance"
        value={[value]}
        // Pressing the selected option again would empty the group; the choice stays.
        onValueChange={([picked]) => picked && onChange(picked)}
      >
        {scopes.map((scope) => (
          <Toggle key={scope} value={scope} className="assistant-scope-option">
            {scope === value && <Check size={14} aria-hidden="true" />}
            {SCOPE_LABEL[scope]}
          </Toggle>
        ))}
      </ToggleGroup>
      <ScopeMenu scopes={scopes} value={value} onChange={onChange} sheet={sheet} />
    </>
  );
}

// A button that opens a listbox: real focus moves between the options (roving), Enter or Space selects and closes, Escape
// closes and takes the event (preventDefault) so the panel behind it stays open (REQ-22).
function ScopeMenu({ scopes, value, onChange, sheet }: { scopes: ScopeKey[]; value: ScopeKey; onChange: (scope: ScopeKey) => void; sheet: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const options = () => [...(wrapRef.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];

  useEffect(() => {
    if (open) options().find((node) => node.getAttribute("aria-selected") === "true")?.focus();
  }, [open]);

  // The menu is hidden by CSS above 640 px; it must not still be open when the sheet comes back.
  useEffect(() => setOpen(false), [sheet]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function choose(scope: ScopeKey) {
    onChange(scope);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nodes = options();
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      nodes[(to + nodes.length) % nodes.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown": return move(at + 1);
      case "ArrowUp": return move(at - 1);
      case "Home": return move(0);
      case "End": return move(nodes.length - 1);
      case "Enter":
      case " ":
        // On the button itself (at < 0) Enter and Space keep their click.
        if (at < 0) return;
        event.preventDefault();
        return choose(scopes[at]);
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        return close();
      case "Tab":
        // Focus leaves the menu from the button, so Tab continues from there instead of from a node about to unmount.
        setOpen(false);
        buttonRef.current?.focus();
    }
  }

  // Focus going anywhere outside the button and its menu (a click elsewhere included) dismisses the menu.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!wrapRef.current?.contains(event.relatedTarget)) setOpen(false);
  }

  return (
    <div className="assistant-scope-menu" ref={wrapRef} onKeyDown={open ? onKeyDown : undefined} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        className="assistant-scope-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen(!open)}
      >
        Alcance: {SCOPE_LABEL[value]}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={listboxId} role="listbox" aria-label="Alcance" className="assistant-scope-list" onMouseDown={(event) => event.preventDefault()}>
          {scopes.map((scope) => (
            <div key={scope} role="option" aria-selected={scope === value} tabIndex={-1} className="assistant-scope-choice" onClick={() => choose(scope)}>
              {SCOPE_LABEL[scope]}
              {scope === value && <Check size={16} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
