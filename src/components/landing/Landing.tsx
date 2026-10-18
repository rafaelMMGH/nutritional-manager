"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CaretDown,
  ChatCircleText,
  Check,
  CookingPot,
  Drop,
  FilePdf,
  ListChecks,
  ShieldCheck,
  ShoppingCartSimple,
  Sparkle
} from "@phosphor-icons/react";
import { LandingFooter, LandingMark } from "@/components/landing/LandingChrome";
import { manrope } from "@/components/landing/font";

const NAV = [
  { id: "beneficios", label: "Beneficios" },
  { id: "como-funciona", label: "Cómo funciona" },
  { id: "preguntas", label: "Preguntas" }
];

const BENEFITS = [
  {
    icon: CalendarCheck,
    title: "Sabes qué comer y a qué hora",
    body: "Cada comida del plan aparece en tu día con su horario. La marcas al terminarla y ves cuántas te faltan."
  },
  {
    icon: CookingPot,
    title: "Tus recetas, sin buscarlas",
    body: "Cada opción del plan se guarda como receta con sus ingredientes y cantidades, lista para cocinar."
  },
  {
    icon: ShoppingCartSimple,
    title: "La lista del súper se arma sola",
    body: "Elige el periodo que vas a cubrir y recibe los ingredientes sumados. Guarda tus listas frecuentes como plantilla."
  },
  {
    icon: Drop,
    title: "Agua y constancia a la vista",
    body: "Registra tus vasos de agua, cuida tu racha de días y revisa tu avance de la semana desde el inicio."
  },
  {
    icon: ChatCircleText,
    title: "Pregúntale a tu propio plan",
    body: "El asistente responde con tu plan, tu recetario y tu carrito. Tus datos no salen hacia otro servicio."
  }
];

const STEPS = [
  {
    icon: FilePdf,
    title: "Sube el PDF de tu plan",
    body: "El mismo archivo que te mandó tu nutriólogo. Leemos comidas, opciones, equivalentes y suplementos."
  },
  {
    icon: ListChecks,
    title: "Revisa lo que encontramos",
    body: "Antes de guardar ves cada campo detectado y corriges lo que haga falta. Nada se guarda sin tu confirmación."
  },
  {
    icon: CalendarCheck,
    title: "Síguelo cada día",
    body: "Tu inicio muestra las comidas de hoy, el agua, la siguiente receta y lo que falta comprar."
  }
];

const FAQS = [
  {
    q: "¿Qué PDF puedo subir y qué pasa si se lee mal?",
    a: "El plan que te entrega tu nutriólogo, con comidas por horario y sus opciones, en PDF de texto (un escaneo como imagen todavía no se puede leer). Antes de guardar revisas cada campo detectado, y si un ingrediente no se pudo leer queda marcado para revisión en lugar de inventar un nombre."
  },
  {
    q: "¿Sustituye a mi nutriólogo?",
    a: "No. Tu nutriólogo diseña el plan; Nutritional Manager solo te ayuda a seguirlo. No cambia porciones ni hace recomendaciones médicas."
  },
  {
    q: "¿Puedo cambiar de plan o recuperar algo que borré?",
    a: "Sí. Cuando recibes un plan nuevo lo subes y se vuelve el activo; los anteriores quedan guardados. Planes, recetas, listas y plantillas que borras pasan primero a la papelera, desde donde los recuperas."
  },
  {
    q: "¿El asistente usa inteligencia artificial externa?",
    a: "No. Las respuestas se arman con tu plan activo, tu recetario y tu carrito, dentro de la propia aplicación. Tu información no se envía a otro servicio."
  },
  {
    q: "¿Cómo obtengo una cuenta?",
    a: "Por ahora no hay registro abierto: las cuentas las crea quien administra la aplicación. Si ya tienes una, entra con tu correo."
  }
];

// Strong ease-out for UI feedback; matches --lp-ease-out in landing.css.
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Stagger position for a child of .lp-stagger, set on the child itself.
const order = (index: number) => ({ "--lp-i": index }) as CSSProperties;

// Without JavaScript nothing would ever reveal, so show everything.
const NO_SCRIPT_CSS = ".lp-js .lp-reveal, .lp-js .lp-stagger > * { opacity: 1 !important; filter: none !important; transform: none !important; }";

const TAGLINE = "Tu nutriólogo diseña el plan. Nosotros te ayudamos a cumplirlo todos los días.";

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // Scroll reveals and the active nav item, both through IntersectionObserver (never a scroll listener).
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const reveals = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          reveals.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    node.querySelectorAll(".lp-reveal, .lp-stagger").forEach((el) => reveals.observe(el));

    const sections = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    node.querySelectorAll("section[id]").forEach((el) => sections.observe(el));
    return () => {
      reveals.disconnect();
      sections.disconnect();
    };
  }, []);

  return (
    // lp-js is rendered by the server so sections already on screen start hidden and animate in on load.
    // Adding it after hydration made them fade out and straight back in, which looked like no animation.
    <div className={`lp lp-js ${manrope.variable}`} ref={root}>
      <noscript dangerouslySetInnerHTML={{ __html: `<style>${NO_SCRIPT_CSS}</style>` }} />
      <a className="lp-skip" href="#contenido">
        Saltar al contenido
      </a>
      <IslandNav active={active} />

      <main id="contenido">
        <Hero />
        <Problem />
        <Benefits />
        <Tagline />
        <HowItWorks />
        <Proof />
        <Faq />
      </main>

      <LandingFooter />
    </div>
  );
}

function IslandNav({ active }: { active: string | null }) {
  const [open, setOpen] = useState(false);
  const tabs = useRef<HTMLDivElement>(null);
  const [clip, setClip] = useState<string | null>(null);

  // The active pill is a styled copy of the links, clipped to the active one, so text and background move together.
  useEffect(() => {
    const box = tabs.current;
    if (!box) return;
    const update = () => {
      const link = active ? box.querySelector<HTMLElement>(`ul:not([aria-hidden]) a[href="#${active}"]`) : null;
      if (!link) return setClip(null);
      const right = box.offsetWidth - link.offsetLeft - link.offsetWidth;
      setClip(`inset(0 ${right}px 0 ${link.offsetLeft}px round 9999px)`);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <nav className="lp-island" aria-label="Principal">
        <Link href="/" className="lp-brand" aria-label="Nutritional Manager, inicio" onClick={() => setOpen(false)}>
          <LandingMark />
          <span>Nutritional Manager</span>
        </Link>
        <div className="lp-island-tabs" ref={tabs}>
          <ul className="lp-island-links">
            {NAV.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <ul className={`lp-island-links lp-island-active${clip ? " is-on" : ""}`} aria-hidden style={clip ? { clipPath: clip } : undefined}>
            {NAV.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <Link href="/login" className="lp-btn lp-btn-sm">
          Entrar
        </Link>
        <button
          type="button"
          className={`lp-burger${open ? " is-open" : ""}`}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          aria-controls="lp-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
      </nav>

      <div id="lp-menu" className={`lp-menu${open ? " is-open" : ""}`} aria-hidden={!open} inert={!open}>
        <ul>
          {NAV.map((item, index) => (
            <li key={item.id} style={{ transitionDelay: open ? `${100 + index * 50}ms` : "0ms" }}>
              <a href={`#${item.id}`} onClick={() => setOpen(false)} aria-current={active === item.id ? "location" : undefined}>
                {item.label}
              </a>
            </li>
          ))}
          <li style={{ transitionDelay: open ? `${100 + NAV.length * 50}ms` : "0ms" }}>
            <Link href="/login" className="lp-btn" onClick={() => setOpen(false)}>
              Entrar a mi plan <ArrowRight size={18} weight="bold" aria-hidden />
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}

function PrimaryCta() {
  return (
    <Link href="/login" className="lp-btn">
      Entrar a mi plan <ArrowRight size={18} weight="bold" aria-hidden />
    </Link>
  );
}

function SectionHead({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="lp-section-head lp-reveal">
      <p className="lp-kicker">{kicker}</p>
      <h2>{title}</h2>
      {children && <p className="lp-lead">{children}</p>}
    </header>
  );
}

function Hero() {
  return (
    <section id="arriba" className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero-copy">
        <p className="lp-pill">
          <FilePdf size={16} weight="bold" aria-hidden /> De PDF a tu día a día
        </p>
        <h1 id="lp-hero-title">
          <span>Sigue tu plan </span>
          <span>de alimentación </span>
          <span>sin volver al PDF</span>
        </h1>
        <p className="lp-hero-sub">
          Sube el plan que te dio tu nutriólogo y lo convertimos en horarios, recetas y lista de compras. Todo en un solo lugar, solo para ti.
        </p>
        <PrimaryCta />
        <p className="lp-proof">
          <Check size={16} weight="bold" aria-hidden /> Un plan de 6 comidas al día se vuelve 42 comidas por semana, cada una con su hora y su receta.
        </p>
      </div>
      <HeroVisual />
    </section>
  );
}

const MEALS = [
  { time: "6:30 a.m.", name: "Licuado pre entreno", tag: "Pre entreno", tone: "teal", img: "banana" },
  { time: "8:00 a.m.", name: "Huevos rancheros", tag: "Desayuno", tone: "coral", img: "egg" },
  { time: "12:00 p.m.", name: "Manzana con uva verde", tag: "Colación", tone: "green", img: "apple" },
  { time: "2:00 p.m.", name: "Fajitas de pollo con verduras", tag: "Comida", tone: "yellow", img: "poultry" }
];

// A small working copy of the dashboard: meals and water glasses respond to clicks, and the next meal checks itself once.
function HeroVisual() {
  const [done, setDone] = useState([true, true, false, false]);
  const [glasses, setGlasses] = useState(5);
  const touched = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!touched.current) setDone((value) => value.map((item, index) => item || index === 2));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, []);

  const toggle = (index: number) => {
    touched.current = true;
    setDone((value) => value.map((item, i) => (i === index ? !item : item)));
  };
  const count = done.filter(Boolean).length;

  return (
    <figure className="lp-hero-visual" aria-label="Demostración del inicio de Nutritional Manager: marca comidas y vasos de agua">
      <div className="lp-frame">
        <div className="lp-mock lp-mock-day">
          <div className="lp-mock-head">
            <strong>Comidas de hoy</strong>
            <span className="lp-count" key={count} aria-live="polite">
              {count} de 6
            </span>
          </div>
          <ol className="lp-mock-meals">
            {MEALS.map((meal, index) => (
              <li key={meal.name}>
                <button type="button" className={done[index] ? "is-done" : undefined} aria-pressed={done[index]} onClick={() => toggle(index)}>
                  <span className="lp-mock-check" aria-hidden>
                    {done[index] && <Check size={10} weight="bold" />}
                  </span>
                  <img src={`/food/${meal.img}.png`} alt="" width={40} height={40} />
                  <span className="lp-mock-meal">
                    <small>{meal.time}</small>
                    <b>{meal.name}</b>
                  </span>
                  <span className={`lp-tag tone-${meal.tone}`}>{meal.tag}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="lp-mock-side">
          <div className="lp-mock lp-mock-water">
            <div className="lp-mock-head">
              <strong>Agua</strong>
              <span>{glasses * 0.25} de 2 L</span>
            </div>
            <div className="lp-glasses" role="group" aria-label="Vasos de agua de 250 ml">
              {Array.from({ length: 8 }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={index < glasses ? "is-full" : undefined}
                  aria-label={`${index + 1} ${index ? "vasos" : "vaso"}`}
                  aria-pressed={index < glasses}
                  onClick={() => setGlasses(index + 1 === glasses ? index : index + 1)}
                >
                  <span style={order(index)} />
                </button>
              ))}
            </div>
          </div>
          <div className="lp-mock lp-mock-cart">
            <div className="lp-mock-head">
              <strong>Carrito</strong>
              <span>14 ingredientes</span>
            </div>
            <ul>
              <li>
                <img src="/food/avocado.png" alt="" width={24} height={24} /> Aguacate <small>3 piezas</small>
              </li>
              <li>
                <img src="/food/poultry.png" alt="" width={24} height={24} /> Pechuga de pollo <small>840 g</small>
              </li>
              <li>
                <img src="/food/grapes.png" alt="" width={24} height={24} /> Uva verde <small>1 bolsa</small>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </figure>
  );
}

function Problem() {
  return (
    <section id="problema" className="lp-section lp-problem" aria-labelledby="lp-problem-title">
      <div className="lp-wrap lp-split">
        <div className="lp-reveal">
          <p className="lp-kicker">El problema</p>
          <h2 id="lp-problem-title">Tu plan es bueno. Seguirlo desde un PDF es lo difícil.</h2>
        </div>
        <ul className="lp-pains lp-reveal">
          <li>
            <b>Buscas qué toca ahora</b> entre páginas de tablas y equivalentes, con el teléfono en una mano.
          </li>
          <li>
            <b>Haces la lista del súper a mano</b> y sumas cantidades de cinco recetas distintas.
          </li>
          <li>
            <b>Pierdes la cuenta</b> de cuántas comidas y vasos de agua llevas en el día.
          </li>
          <li className="lp-pains-answer">
            <Sparkle size={20} weight="fill" aria-hidden />
            <span>
              Nutritional Manager lee el PDF una vez y te entrega el plan ordenado por hora, por receta y por ingrediente.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section id="beneficios" className="lp-section" aria-labelledby="lp-benefits-title">
      <div className="lp-wrap">
        <SectionHead kicker="Beneficios" title={<span id="lp-benefits-title">Todo lo que tu plan necesita para cumplirse</span>} />
        <ul className="lp-benefits lp-stagger">
          {BENEFITS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} style={order(index)}>
              <div className="lp-card">
                <span className="lp-icon" aria-hidden>
                  <Icon size={24} weight="duotone" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Tagline() {
  const ref = useRef<HTMLParagraphElement>(null);

  // Each word lights up as it crosses a line just above the middle of the viewport, in reading order.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const words = node.querySelectorAll<HTMLSpanElement>("span");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const passed = entry.isIntersecting || entry.boundingClientRect.top < 0;
          entry.target.classList.toggle("is-lit", passed);
        }
      },
      { rootMargin: "0px 0px -45% 0px" }
    );
    words.forEach((word) => observer.observe(word));
    return () => observer.disconnect();
  }, []);

  const [first, second] = TAGLINE.split(". ");
  return (
    <section id="promesa" className="lp-section lp-tagline" aria-label="Nuestra promesa">
      <div className="lp-wrap">
        <p ref={ref} aria-label={TAGLINE}>
          {[`${first}.`, second].map((line, lineIndex) => (
            <span key={lineIndex} className="lp-tagline-line" aria-hidden>
              {line.split(" ").map((word, index) => (
                <span key={index}>{word} </span>
              ))}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="como-funciona" className="lp-section lp-surface" aria-labelledby="lp-how-title">
      <div className="lp-wrap">
        <SectionHead kicker="Cómo funciona" title={<span id="lp-how-title">Tres pasos y tu plan queda listo</span>}>
          La primera vez toma unos minutos. Después solo abres tu inicio.
        </SectionHead>
        <ol className="lp-steps lp-stagger">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="lp-step" style={order(index)}>
              <span className="lp-step-num">{index + 1}</span>
              <span className="lp-icon" aria-hidden>
                <Icon size={24} weight="duotone" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section id="cifras" className="lp-section" aria-labelledby="lp-proof-title">
      <div className="lp-wrap">
        <SectionHead kicker="De un solo PDF" title={<span id="lp-proof-title">Lo que sale de un plan real</span>}>
          Estas cifras vienen de un plan de seis comidas al día subido a la aplicación.
        </SectionHead>
        <dl className="lp-facts lp-stagger">
          <div className="lp-fact" style={order(0)}>
            <dt>Comidas con horario</dt>
            <dd>42</dd>
            <p>por semana, de las 6:30 a.m. a la cena.</p>
          </div>
          <div className="lp-fact" style={order(1)}>
            <dt>Opciones por comida</dt>
            <dd>4</dd>
            <p>guardadas como recetas con sus ingredientes.</p>
          </div>
          <div className="lp-fact" style={order(2)}>
            <dt>Grupos de equivalentes</dt>
            <dd>3</dd>
            <p>cereal, origen animal y grasa, contados en el día.</p>
          </div>
          <div className="lp-fact" style={order(3)}>
            <dt>Meta de agua</dt>
            <dd>2 L</dd>
            <p>en vasos de 250 ml que marcas con un toque.</p>
          </div>
        </dl>
        <p className="lp-reassure lp-reveal">
          <ShieldCheck size={20} weight="duotone" aria-hidden /> Tu plan es privado: solo tú lo ves al entrar con tu cuenta, y lo que borras pasa primero a la papelera.
        </p>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="preguntas" className="lp-section lp-surface" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-faq-wrap">
        <SectionHead kicker="Preguntas" title={<span id="lp-faq-title">Lo que suelen preguntar</span>} />
        <div className="lp-faq lp-stagger">
          {FAQS.map((item, index) => (
            <FaqItem key={item.q} question={item.q} answer={item.a} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Native <details>, with the answer's height animated both ways. Closing waits for the animation before removing [open].
function FaqItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const details = useRef<HTMLDetailsElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);
  const [open, setOpen] = useState(false);

  function toggle(event: MouseEvent) {
    event.preventDefault();
    const el = details.current;
    const content = body.current;
    if (!el || !content) return;
    const opening = !open;
    setOpen(opening);
    if (prefersReducedMotion()) {
      el.open = opening;
      return;
    }
    // Start from wherever an interrupted animation left off.
    const from = el.open ? content.getBoundingClientRect().height : 0;
    running.current?.cancel();
    el.open = true;
    const to = opening ? content.scrollHeight : 0;
    const animation = content.animate(
      [
        { height: `${from}px`, opacity: opening ? 0 : 1 },
        { height: `${to}px`, opacity: opening ? 1 : 0 }
      ],
      { duration: 200, easing: EASE_OUT }
    );
    running.current = animation;
    animation.onfinish = () => {
      running.current = null;
      if (!opening) el.open = false;
    };
  }

  return (
    <details ref={details} style={order(index)} data-open={open || undefined}>
      <summary onClick={toggle}>
        {question}
        <CaretDown size={20} weight="bold" aria-hidden />
      </summary>
      <div className="lp-faq-body" ref={body}>
        <p>{answer}</p>
      </div>
    </details>
  );
}
