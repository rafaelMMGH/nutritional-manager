"use client";

import { useState } from "react";
import { Check, Plus, ShoppingCart } from "lucide-react";

// White round cart+plus button (same as the recipe page tiles). Shows a check for a moment once added.
export function AddToCartButton({ label, onAdd, className = "" }: { label: string; onAdd: () => Promise<boolean>; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  async function add() {
    setState("busy");
    const ok = await onAdd();
    setState(ok ? "added" : "idle");
    if (ok) setTimeout(() => setState("idle"), 1600);
  }
  return (
    <button type="button" className={`ingredient-add ${state === "added" ? "added" : ""} ${className}`} title={label} aria-label={label} disabled={state === "busy"} onClick={add}>
      {state === "added" ? <Check size={15} /> : <><ShoppingCart size={15} /><Plus size={10} strokeWidth={3.5} className="ingredient-add-plus" /></>}
    </button>
  );
}
