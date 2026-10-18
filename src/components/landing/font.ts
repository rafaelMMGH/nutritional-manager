import { Manrope } from "next/font/google";

// The single typeface for the whole app: landing, login and the signed-in pages.
export const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
