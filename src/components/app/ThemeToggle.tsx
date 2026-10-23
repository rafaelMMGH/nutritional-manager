"use client";

import { Moon, Sun } from "lucide-react";
import { switchTheme, useTheme } from "@/lib/client/theme";

// Icon-only switch. The icon shows the current theme; the name and title say what a click does.
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Cambiar a tema oscuro" : "Cambiar a tema claro";
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => switchTheme(next)}>
      <Sun size={20} aria-hidden data-icon={theme === "light" ? "sun" : undefined} />
      <Moon size={20} aria-hidden data-icon={theme === "dark" ? "moon" : undefined} />
    </button>
  );
}
