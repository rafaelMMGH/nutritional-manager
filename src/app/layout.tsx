import type { Metadata } from "next";
import { Toaster } from "sonner";
import { manrope } from "@/components/landing/font";
import "./globals.css";


export const metadata: Metadata = {
  title: "Nutritional Manager",
  description: "Private nutritional plan manager"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
