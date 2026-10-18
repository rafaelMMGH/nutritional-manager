"use client";

import { useEffect, useRef, useState } from "react";

export type AddState = "idle" | "busy" | "added";

// State for an "add to cart" button: busy while the request runs, "added" for a moment after it lands, then idle again.
export function useAddState(action: () => Promise<boolean>): [AddState, () => Promise<void>] {
  const [state, setState] = useState<AddState>("idle");
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function run() {
    if (state !== "idle") return;
    setState("busy");
    const ok = await action();
    if (!ok) return setState("idle");
    setState("added");
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  }

  return [state, run];
}
