import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

// The theme lives on <html> (class, color-scheme, theme-color meta), set before paint by themeInitScript.
// This module reads and writes that same DOM state.

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)");

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch (error) {
    console.warn("[theme] could not read the saved choice, following the OS", error);
    return null;
  }
}

function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
}

/** Applies the theme to the page and remembers it. If storage fails the page still changes. */
export function switchTheme(next: Theme) {
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
    if (readStored() === null) applyTheme(query.matches ? "dark" : "light");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** The theme in effect. "light" on the server, then the real one right after hydration. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "light");
}
