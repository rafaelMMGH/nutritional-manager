import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

// Public landing page. Signed-out visitors to "/" are rewritten here by the middleware.
export const metadata: Metadata = {
  title: "Nutritional Manager · Sigue tu plan de alimentación sin volver a abrir el PDF",
  description:
    "Sube el plan de tu nutriólogo y conviértelo en horarios, recetas y lista de compras. Marca tus comidas, registra tu agua y pregúntale a tu propio plan.",
  openGraph: {
    title: "Sigue tu plan de alimentación sin volver a abrir el PDF",
    description: "Tu plan del nutriólogo, convertido en horarios, recetas y lista de compras.",
    type: "website",
    locale: "es_MX",
    siteName: "Nutritional Manager"
  },
  twitter: { card: "summary_large_image" }
};

export default function InicioPage() {
  return <Landing />;
}
