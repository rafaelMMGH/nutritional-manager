import type { Metadata } from "next";
import { LandingPlainPage } from "@/components/landing/LandingChrome";

export const metadata: Metadata = { title: "Privacidad · Nutritional Manager", description: "Qué datos guarda Nutritional Manager y cómo los usa." };

export default function PrivacyPage() {
  return (
    <LandingPlainPage>
      <p className="lp-meta">Actualizado el 17 de octubre de 2026</p>
      <h1>Privacidad</h1>
      <p>Nutritional Manager es una aplicación privada para seguir tu plan de alimentación. Esta página explica qué guardamos y para qué.</p>
      <h2>Qué datos guardamos</h2>
      <ul>
        <li>Tu nombre y correo, para identificar tu cuenta.</li>
        <li>Los PDF de planes que subes y la información que extraemos de ellos: comidas, recetas, ingredientes, equivalentes y suplementos.</li>
        <li>Lo que registras cada día: comidas marcadas, vasos de agua y horarios.</li>
        <li>Tus carritos, listas y plantillas de compras.</li>
      </ul>
      <h2>Cómo los usamos</h2>
      <p>Solo para mostrarte tu plan, tu recetario y tus compras. El asistente responde con esa misma información dentro de la aplicación; no la envía a servicios externos.</p>
      <h2>Cookies</h2>
      <p>Usamos una sola cookie de sesión para mantenerte dentro de tu cuenta. No usamos cookies de publicidad ni de analítica.</p>
      <h2>Borrar tu información</h2>
      <p>Los planes, recetas, listas y plantillas que borras pasan a la papelera, donde puedes recuperarlos. Para eliminar tu cuenta por completo, pídelo a quien administra la aplicación.</p>
    </LandingPlainPage>
  );
}
