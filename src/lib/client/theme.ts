import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_LOCK_ATTRIBUTE, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

// The theme lives on <html> (class, color-scheme, theme-color meta), set before paint by themeInitScript.
// This module reads and writes that same DOM state.

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)");

// The choice made with the switch in this page. With storage blocked nothing is stored, but a live OS change must
// still not undo an explicit click; only the next load falls back to the OS.
let chosen: Theme | null = null;

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch (error) {
    console.warn("[theme] could not read the saved choice, following the OS", error);
    return null;
  }
}

const LOCK_SELECTOR = `[${THEME_LOCK_ATTRIBUTE}]`;

/** A light-locked page (landing, legal, 404) is on screen. */
const isLocked = () => document.querySelector(LOCK_SELECTOR) !== null;

/** The theme in effect: light on a locked page, whatever the user chose. */
function getTheme(): Theme {
  return !isLocked() && document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** The user's theme: the click in this page, else the stored choice, else the OS. */
function preferredTheme(): Theme {
  return chosen ?? readStored() ?? (prefersDark().matches ? "dark" : "light");
}

/**
 * Sets the class that carries the user's theme, then the browser-facing state (color-scheme, theme-color), which a
 * locked page keeps light. The class stays dark under a lock: the CSS scopes dark away from locked pages.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  applyChrome(isLocked() ? "light" : theme);
}

function applyChrome(theme: Theme) {
  document.documentElement.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
}

/** Applies the theme to the page and remembers it. If storage fails the page still changes. Ignored on locked pages. */
export function switchTheme(next: Theme) {
  if (isLocked()) return;
  chosen = next;
  applyTheme(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (error) {
    console.warn("[theme] could not save the choice, the next load follows the OS", error);
  }
}

/** Keeps the page on the OS theme while the user has not chosen one. Returns the cleanup. */
export function followSystem() {
  const query = prefersDark();
  const onChange = () => {
    if (chosen === null && readStored() === null) applyTheme(query.matches ? "dark" : "light");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Calls onChange after a light-locked page appears or disappears with no reload (soft navigation, or the same URL
 * swapping the app for the landing). The pathname cannot tell, so this watches the lock itself, once per frame.
 */
export function watchLock(onChange: () => void) {
  let locked = isLocked();
  let frame = 0;
  const observer = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (isLocked() === locked) return;
      locked = !locked;
      onChange();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [THEME_LOCK_ATTRIBUTE] });
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}

/** Brings color-scheme and theme-color in line with the page now on screen (light if locked, else the user's theme). */
export function syncDocument() {
  applyTheme(preferredTheme());
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const stopWatchingLock = watchLock(onChange);
  return () => {
    observer.disconnect();
    stopWatchingLock();
  };
}

/** The theme in effect (light on locked pages). "light" on the server, then the real one right after hydration. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "light");
}
