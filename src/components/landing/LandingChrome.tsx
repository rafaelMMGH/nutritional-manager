import Link from "next/link";
import { manrope } from "@/components/landing/font";
import "./landing.css";

// Brand mark and footer shared by the landing page, the legal pages and the 404.
export function LandingMark() {
  return (
    <span className="lp-mark" aria-hidden>
      N
    </span>
  );
}

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-row">
        <Link href="/" className="lp-brand">
          <LandingMark />
          <span>Nutritional Manager</span>
        </Link>
        <nav aria-label="Legal">
          <ul>
            <li>
              <Link href="/privacidad">Privacidad</Link>
            </li>
            <li>
              <Link href="/terminos">Términos</Link>
            </li>
            <li>
              <Link href="/login">Entrar</Link>
            </li>
          </ul>
        </nav>
        <p>© 2026 Nutritional Manager</p>
      </div>
    </footer>
  );
}

// Simple centered frame for the legal pages and the 404. These pages always render light (data-theme-lock),
// which is why the attribute is on this root only and never on the footer or mark that /login also renders.
export function LandingPlainPage({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lp lp-js ${manrope.variable}`} data-theme-lock="light">
      <a className="lp-skip" href="#contenido">
        Saltar al contenido
      </a>
      <nav className="lp-island" aria-label="Principal">
        <Link href="/" className="lp-brand">
          <LandingMark />
          <span>Nutritional Manager</span>
        </Link>
        <Link href="/login" className="lp-btn lp-btn-sm">
          Entrar
        </Link>
      </nav>
      <main id="contenido" className="lp-plain">
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}
