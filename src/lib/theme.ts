// Theme constants and the blocking init script. Shared by the root layout (server) and the client runtime.

export type Theme = "light" | "dark";

/** localStorage key of the explicit choice. Absent means "follow the OS". */
export const THEME_STORAGE_KEY = "nm-theme";

/** Marks the roots of pages that always render light (landing, legal pages, 404). */
export const THEME_LOCK_ATTRIBUTE = "data-theme-lock";

/** Page background per theme, for meta theme-color. Each must equal `--canvas` in globals.css. */
export const THEME_COLORS: Record<Theme, string> = { light: "#f4f4f7", dark: "#0a100d" };

/**
 * Runs in <head> before any bundle, so the first paint already has the right theme: sets the `dark` class, the
 * inline color-scheme and a theme-color meta. A storage failure falls back to the OS and warns, never errors.
 */
export const themeInitScript = `(function () {
  var root = document.documentElement;
  var colors = ${JSON.stringify(THEME_COLORS)};
  var theme = null;
  try {
    var saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (error) {
    console.warn("[theme] could not read the saved choice, following the OS", error);
  }
  if (!theme) theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  var meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = colors[theme];
  document.head.appendChild(meta);
  // A light-locked page is only known once its markup is parsed; the lock's CSS already forces color-scheme.
  document.addEventListener("DOMContentLoaded", function () {
    if (document.querySelector(${JSON.stringify(`[${THEME_LOCK_ATTRIBUTE}]`)})) meta.content = colors.light;
  });
})();`;
