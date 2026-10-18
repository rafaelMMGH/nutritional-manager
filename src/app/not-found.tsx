import type { Metadata } from "next";
import Link from "next/link";
import { LandingPlainPage } from "@/components/landing/LandingChrome";

export const metadata: Metadata = { title: "Página no encontrada · Nutritional Manager" };

export default function NotFound() {
  return (
    <LandingPlainPage>
      <div className="lp-404">
        <img src="/food/plate.png" alt="Plato vacío" width={96} height={96} />
        <p className="lp-meta">Error 404</p>
        <h1>Este plato está vacío</h1>
        <p>La página que buscas no existe o cambió de lugar. Vuelve al inicio para seguir con tu plan.</p>
        <Link href="/" className="lp-btn">
          Volver al inicio
        </Link>
      </div>
    </LandingPlainPage>
  );
}
