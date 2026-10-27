"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/client/useMediaQuery";
import type { Turn } from "./AssistantTurn";

/** "At the bottom" means within this many pixels of it (REQ-11). */
const AT_BOTTOM_PX = 24;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// The log's scrolling (REQ-11, REQ-16), written for this log instead of pulling in a stick-to-bottom package:
// - sending a question scrolls to the bottom, so the question and the pending turn show;
// - an answer landing while the reader is at the bottom keeps the log there, or, when it is taller than the log, shows
//   its first line at the top;
// - an answer landing while the reader is scrolled up leaves the position alone and reports `atBottom: false`.
export function useChatScroll(turns: Turn[]) {
  const logRef = useRef<HTMLDivElement>(null);
  const reduced = useMediaQuery(REDUCED_MOTION);
  const [atBottom, setAtBottom] = useState(true);
  // Whether the reader is following the bottom: set when they are within 24 px of it or one of our scrolls takes them there,
  // cleared when they scroll up. It is not recomputed from the position alone, because a smooth scroll in flight (`auto`)
  // and a log that just grew are both away from the bottom without the reader having left it.
  const stuck = useRef(true);
  const auto = useRef(false);
  // Whether the reader is at (or being taken to) the bottom, as opposed to `stuck` alone, which also holds after an
  // answer taller than the log put its first line at the top. Only a log following the bottom is re-stuck on resize.
  const following = useRef(true);
  const lastTop = useRef(0);
  const previous = useRef<Turn[]>([]);

  const distance = useCallback(() => {
    const log = logRef.current;
    return log ? log.scrollHeight - log.scrollTop - log.clientHeight : 0;
  }, []);

  // The button shows whenever the reader is away from the bottom and not being taken there.
  const sync = useCallback(() => setAtBottom(distance() <= AT_BOTTOM_PX || (auto.current && stuck.current)), [distance]);

  const scrollTo = useCallback(
    (top: number) => {
      const log = logRef.current;
      if (!log) return;
      const target = Math.max(0, Math.min(top, log.scrollHeight - log.clientHeight));
      // `scrollend` never fires for a scroll that goes nowhere, so only a real move is marked as in flight.
      auto.current = !reduced && Math.abs(target - log.scrollTop) > 1;
      log.scrollTo({ top: target, behavior: reduced ? "instant" : "smooth" });
    },
    [reduced]
  );

  const scrollToBottom = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    scrollTo(log.scrollHeight);
    stuck.current = true;
    following.current = true;
    setAtBottom(true);
  }, [scrollTo]);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const onScroll = () => {
      if (distance() <= AT_BOTTOM_PX) {
        stuck.current = true;
        following.current = true;
      } else if (log.scrollTop < lastTop.current) {
        stuck.current = false;
        following.current = false;
        auto.current = false;
      }
      lastTop.current = log.scrollTop;
      sync();
    };
    const onEnd = () => {
      auto.current = false;
      sync();
    };
    const onReader = () => {
      auto.current = false;
    };
    // The log resizes when the composer grows or shrinks, or the panel changes size. Resizing never moves the content
    // by itself, so a reader following the bottom is put back there: at once, or by aiming a smooth scroll in flight at
    // the new bottom. Anyone else only gets the button re-synced. Scrolling does not resize the log, so this cannot loop.
    const observer = new ResizeObserver(() => {
      if (stuck.current && following.current) {
        if (auto.current) scrollTo(log.scrollHeight);
        else log.scrollTop = log.scrollHeight;
      }
      sync();
    });
    observer.observe(log);
    log.addEventListener("scroll", onScroll);
    log.addEventListener("scrollend", onEnd);
    for (const type of ["wheel", "touchmove", "keydown", "pointerdown"]) log.addEventListener(type, onReader, { passive: true });
    return () => {
      observer.disconnect();
      log.removeEventListener("scroll", onScroll);
      log.removeEventListener("scrollend", onEnd);
      for (const type of ["wheel", "touchmove", "keydown", "pointerdown"]) log.removeEventListener(type, onReader);
    };
  }, [distance, sync, scrollTo]);

  // Runs before paint, so the new turn never shows at the old position for a frame.
  useLayoutEffect(() => {
    const log = logRef.current;
    const before = previous.current;
    previous.current = turns;
    if (!log) return;
    if (turns.length === 0) {
      auto.current = false;
      stuck.current = true;
      setAtBottom(true);
      return;
    }
    if (turns.length > before.length) {
      scrollToBottom();
      return;
    }
    // A pending turn that settled (an answer, an error or a retry's result) is always the last one: only one request runs at a time.
    const last = turns[turns.length - 1];
    const settled = last.role === "assistant" && last.status !== "pending" && before.some((turn) => turn.id === last.id && turn.role === "assistant" && turn.status === "pending");
    if (!settled || !stuck.current) {
      sync();
      return;
    }
    const turn = log.lastElementChild;
    if (!(turn instanceof HTMLElement)) return;
    const style = getComputedStyle(log);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    if (turn.offsetHeight <= log.clientHeight - padding) {
      scrollToBottom();
    } else {
      const top = turn.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop - parseFloat(style.paddingTop);
      following.current = false;
      scrollTo(top);
      sync();
    }
  }, [turns, scrollTo, scrollToBottom, sync]);

  return { logRef, atBottom, scrollToBottom };
}
