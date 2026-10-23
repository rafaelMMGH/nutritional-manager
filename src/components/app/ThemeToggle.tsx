"use client";

import { Moon, Sun } from "lucide-react";
import { switchTheme, useTheme } from "@/lib/client/theme";

// Icon-only switch. The icon shows the current theme; the name and title say what a click does.
// Which icon is visible comes from CSS (html.dark), so the first paint is right for a dark user before React
// hydrates. data-icon follows React for tests. The name and title stay React-driven: the server cannot know the
// theme, so a dark user's button is named for light until hydration (a few ms); a second, CSS-hidden label would
// break the single accessible name.
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Cambiar a tema oscuro" : "Cambiar a tema claro";
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => switchTheme(next)}>
      <Sun className="theme-icon-sun" size={20} aria-hidden data-icon={theme === "light" ? "sun" : undefined} />
      <Moon className="theme-icon-moon" size={20} aria-hidden data-icon={theme === "dark" ? "moon" : undefined} />
    </button>
  );
}
