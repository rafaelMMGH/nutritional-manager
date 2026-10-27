"use client";

import { useSyncExternalStore } from "react";

/** Whether `query` matches now, and re-renders when it changes. The server snapshot is `false`, so hydration matches the server's render. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
