"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Whether `query` matches now, and re-renders when it changes. The server snapshot is `false`, so hydration matches the server's render. */
export function useMediaQuery(query: string): boolean {
  // Stable per query: a new `subscribe` each render would make React resubscribe every time.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
