"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { followSystem, syncDocument, useTheme, watchLock } from "@/lib/client/theme";

// Mounted once in the root layout: follows the OS theme until the user picks one, keeps color-scheme and
// theme-color right when navigation enters or leaves a light-locked page, and themes the toasts.
export function ThemeRuntime() {
  const theme = useTheme();
  const pathname = usePathname();
  useEffect(() => followSystem(), []);
  useEffect(() => syncDocument(), [pathname]);
  // The pathname alone misses a lock that appears at the same URL (signed-out "/" is rewritten to the landing).
  useEffect(() => watchLock(syncDocument), []);
  return <Toaster richColors closeButton position="top-right" theme={theme} />;
}
