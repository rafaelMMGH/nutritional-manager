import type { Metadata } from "next";
import { ThemeRuntime } from "@/components/app/ThemeRuntime";
import { manrope } from "@/components/landing/font";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nutritional Manager",
  description: "Private nutritional plan manager"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning: the init script adds the dark class and color-scheme to <html> before React hydrates.
  return (
    <html lang="es" className={manrope.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <ThemeRuntime />
      </body>
    </html>
  );
}
