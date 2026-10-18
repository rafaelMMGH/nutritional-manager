"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, WarningCircle } from "@phosphor-icons/react";
import { LandingFooter, LandingMark } from "@/components/landing/LandingChrome";
import { manrope } from "@/components/landing/font";
import { api } from "@/lib/client/api";
import "./login.css";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Food illustrations floating behind the glass card. depth scales how far each one follows the pointer.
const FLOATERS = [
  { img: "avocado", className: "f-a", depth: 0.9 },
  { img: "banana", className: "f-b", depth: 0.5 },
  { img: "egg", className: "f-c", depth: 0.7 },
  { img: "strawberry", className: "f-d", depth: 0.4 },
  { img: "broccoli", className: "f-e", depth: 0.8 },
  { img: "lemon", className: "f-f", depth: 0.6 }
];

type Status = "idle" | "sending" | "done";

export function LoginForm() {
  const router = useRouter();
  const card = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  function checkEmail(value: string) {
    const message = !value.trim() ? "Escribe tu correo." : EMAIL.test(value.trim()) ? null : "Ese correo no parece válido. Revisa que tenga @ y dominio.";
    setEmailError(message);
    return !message;
  }

  // A short horizontal shake, like a rejected password on a Mac, so the error is felt as well as read.
  function shake() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    card.current?.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "translateX(0)" }],
      { duration: 400, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "idle") return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (!checkEmail(email) || !name) {
      setError(!name ? "Escribe tu nombre para continuar." : null);
      shake();
      return;
    }
    setError(null);
    setStatus("sending");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), name }) });
      setStatus("done");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setStatus("idle");
      setError(err instanceof TypeError ? "No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo." : "No pudimos iniciar tu sesión. Inténtalo de nuevo.");
      shake();
    }
  }

  return (
    <div className={`lp lp-js login-page ${manrope.variable}`}>
      <a className="lp-skip" href="#contenido">
        Saltar al contenido
      </a>
      <nav className="lp-island" aria-label="Principal">
        <Link href="/" className="lp-brand">
          <LandingMark />
          <span>Nutritional Manager</span>
        </Link>
        <Link href="/inicio" className="login-back">
          <ArrowLeft size={16} weight="bold" aria-hidden /> Volver al inicio
        </Link>
      </nav>

      <main id="contenido" className="login-stage">
        <Floaters />
        <div className="login-card" ref={card}>
          <header className="login-head">
            <h1>Entra a tu plan</h1>
            <p>Tus comidas de hoy, tus recetas y tu lista del súper te esperan.</p>
          </header>

          <form onSubmit={submit} noValidate className="login-form" aria-describedby={error ? "login-error" : undefined}>
            <div className={`login-field${emailError ? " has-error" : ""}`}>
              <label htmlFor="login-email">Correo</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                defaultValue="demo@nutritional.local"
                required
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "login-email-error" : undefined}
                onBlur={(event) => checkEmail(event.currentTarget.value)}
                onChange={(event) => emailError && checkEmail(event.currentTarget.value)}
              />
              {emailError && (
                <p id="login-email-error" className="login-field-error">
                  {emailError}
                </p>
              )}
            </div>
            <div className="login-field">
              <label htmlFor="login-name">Nombre</label>
              <input id="login-name" name="name" autoComplete="given-name" defaultValue="Rafael" required />
            </div>

            {error && (
              <p id="login-error" className="login-error" role="alert">
                <WarningCircle size={20} weight="fill" aria-hidden /> {error}
              </p>
            )}

            <button type="submit" className="lp-btn login-submit" data-status={status} aria-busy={status === "sending"} disabled={status !== "idle"}>
              <span className="login-submit-label">
                {status === "done" ? (
                  <>
                    <Check size={18} weight="bold" aria-hidden /> Listo
                  </>
                ) : status === "sending" ? (
                  <>
                    Entrando
                    <span className="login-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                  </>
                ) : (
                  <>
                    Entrar a mi plan <ArrowRight size={18} weight="bold" aria-hidden />
                  </>
                )}
              </span>
            </button>
          </form>

          <p className="login-note">Por ahora no hay registro abierto. Las cuentas las crea quien administra la aplicación.</p>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

// Decorative depth layer. On a precise pointer, each illustration follows the cursor by its depth,
// eased toward the target every frame so it settles without overshoot.
function Floaters() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = layer.current;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!node || !fine || reduce) return;
    const items = Array.from(node.querySelectorAll<HTMLElement>("[data-depth]"));
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;

    const tick = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      for (const item of items) {
        const depth = Number(item.dataset.depth);
        item.style.transform = `translate3d(${current.x * depth * 24}px, ${current.y * depth * 24}px, 0)`;
      }
      frame = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (event: PointerEvent) => {
      target.x = event.clientX / window.innerWidth - 0.5;
      target.y = event.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="login-floaters" ref={layer} aria-hidden>
      {FLOATERS.map((item, index) => (
        <span key={item.img} className={`login-floater ${item.className}`} style={{ animationDelay: `${200 + index * 60}ms` }}>
          <img src={`/food/${item.img}.png`} alt="" data-depth={item.depth} />
        </span>
      ))}
    </div>
  );
}
