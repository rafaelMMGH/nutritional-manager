import type { Metadata } from "next";
import { LandingPlainPage } from "@/components/landing/LandingChrome";

export const metadata: Metadata = { title: "Términos · Nutritional Manager", description: "Condiciones de uso de Nutritional Manager." };

export default function TermsPage() {
  return (
    <LandingPlainPage>
      <p className="lp-meta">Actualizado el 17 de octubre de 2026</p>
      <h1>Términos de uso</h1>
      <h2>Qué es y qué no es</h2>
      <p>Nutritional Manager organiza el plan de alimentación que te entregó tu nutriólogo. No es un servicio médico, no diseña planes y no cambia porciones ni indicaciones. Ante cualquier duda sobre tu alimentación, consulta a tu nutriólogo.</p>
      <h2>Tu contenido</h2>
      <p>Los planes que subes siguen siendo tuyos. Solo sube documentos que tengas derecho a usar.</p>
      <h2>Lectura de los PDF</h2>
      <p>La extracción de datos de un PDF puede tener errores. Por eso revisas lo detectado antes de guardar, y los ingredientes que no se pudieron leer aparecen marcados para revisión. Confirma siempre las cantidades con tu plan original.</p>
      <h2>Cuentas</h2>
      <p>Las cuentas las crea quien administra la aplicación. Cuida el acceso a tu dispositivo mientras tu sesión esté abierta, y sal de tu cuenta en equipos compartidos.</p>
    </LandingPlainPage>
  );
}
