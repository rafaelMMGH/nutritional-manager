"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { followSystem, useTheme } from "@/lib/client/theme";

// Mounted once in the root layout: follows the OS theme until the user picks one, and themes the toasts.
export function ThemeRuntime() {
  const theme = useTheme();
  useEffect(() => followSystem(), []);
  return <Toaster richColors closeButton position="top-right" theme={theme} />;
}
