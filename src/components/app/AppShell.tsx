"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stepper12 } from "@/components/ui/stepper-12";
import { formatTime, mealLabel, plural, qty } from "@/components/dashboard/food";
import { useDismiss } from "@/components/useDismiss";
import { Badge, ConfirmationDialogHost, Empty } from "@/components/app/feedback";
import { accountNav, activeView, hrefFor, mainNav } from "@/components/app/navigation";
import { AssistantPageProvider, useAssistantState } from "@/components/app/assistant";
import { AssistantChat, SHEET_QUERY } from "@/components/shared/AssistantChat";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import "./shell.css";
import { api, getErrorMessage } from "@/lib/client/api";
import type { ScopeKey } from "@/lib/assistant";
import { useMediaQuery } from "@/lib/client/useMediaQuery";

export type ShellUser = { name: string; email: string };

type Shell = {
  /** Re-runs the Server Components for the current route and tells client-loaded views to refetch. */
  refresh: () => void;
  openDrawer: () => void;
  openUpload: () => void;
  assistantBusy: boolean;
  askAssistant: (message: string, scope: ScopeKey) => Promise<void>;
};

const ShellContext = createContext<Shell | null>(null);

export function useShell() {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside <AppShell>");
  return shell;
}

type Props = { user: ShellUser; children: ReactNode };

// Frame shared by every signed-in page: top bar, floating assistant and the PDF upload wizard.
export function AppShell({ user, children }: Props) {
  const router = useRouter();
  const [wizard, setWizard] = useState<{ step: number; data: any } | null>(null);
  const assistant = useAssistantState();
  const { setOpen: setAssistantOpen, askInScope, busy: assistantBusy } = assistant;

  // At ≤640 px the open panel is a modal sheet (REQ-22): the page behind is inert and cannot scroll. Tab wrapping and
  // focus live in AssistantChat; inert alone would let Tab escape to the browser.
  const narrow = useMediaQuery(SHEET_QUERY);
  const sheet = assistant.open && narrow;
  useEffect(() => {
    if (!sheet) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [sheet]);

  // Every page reads its data on the server, so re-rendering them picks up any change.
  const refresh = useCallback(() => router.refresh(), [router]);

  const openDrawer = useCallback(() => setAssistantOpen(true), [setAssistantOpen]);

  const askAssistant = useCallback((message: string, scope: ScopeKey) => askInScope(message, scope), [askInScope]);

  const shell = useMemo<Shell>(() => ({ refresh, openDrawer, assistantBusy, askAssistant, openUpload: () => setWizard({ step: 0, data: null }) }), [refresh, openDrawer, assistantBusy, askAssistant]);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      toast.success("Sesión cerrada");
      router.replace("/login");
      router.refresh();
    } catch (err) {
      toast.error("No se pudo cerrar sesión", { description: getErrorMessage(err) });
    }
  }

  return (
    <ShellContext.Provider value={shell}>
      <div className="app-shell">
        <header className="topbar" inert={sheet}>
          <div className="topbar-account">
            <UserMenu user={user} onLogout={logout} />
            <ThemeToggle />
          </div>
          <div className="topbar-island">
            <RoutedNav />
          </div>
        </header>
        <AssistantPageProvider value={assistant.setPage}>
          <main className="content" inert={sheet}>{children}</main>
        </AssistantPageProvider>
        <AssistantChat
          subtitle={assistant.context.subtitle}
          suggestions={assistant.suggestions}
          turns={assistant.turns}
          busy={assistant.busy}
          open={assistant.open}
          onOpenChange={assistant.setOpen}
          onSend={assistant.send}
          onSuggest={assistant.sendRequest}
          onRetry={assistant.retry}
          onClear={assistant.clear}
        />
        {wizard && <UploadWizard wizard={wizard} setWizard={setWizard} refresh={refresh} />}
        <ConfirmationDialogHost />
      </div>
    </ShellContext.Provider>
  );
}

// Highlights the section the current URL belongs to.
function RoutedNav() {
  return <MainNav active={activeView(usePathname())} />;
}

function MainNav({ active }: { active: string | null }) {
  return (
    <nav className="nav" aria-label="Principal">
      {mainNav.map((item) => {
        const Icon = item.icon;
        const current = active === item.key;
        return (
          <Link key={item.key} href={hrefFor(item.key)} className={current ? "pill active" : "pill"} aria-current={current ? "page" : undefined}>
            <Icon size={18} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ user, onLogout }: { user: ShellUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-chip" aria-haspopup="menu" aria-expanded={open} aria-label={`Cuenta de ${user.name}`} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden>
          {String(user.name || "U").charAt(0).toUpperCase()}
        </span>
        <span className="user-text">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </span>
        <ChevronDown size={16} className="user-caret" aria-hidden />
      </button>
      {open && (
        <div className="popover user-popover" role="menu" aria-label="Cuenta">
          {accountNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link role="menuitem" key={item.key} href={hrefFor(item.key)} onClick={() => setOpen(false)}>
                <Icon size={17} /> {item.label}
              </Link>
            );
          })}
          <hr />
          <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onLogout(); }}>
            <LogOut size={17} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function UploadWizard({ wizard, setWizard, refresh }: { wizard: any; setWizard: (wizard: any) => void; refresh: () => void }) {
  const steps = ["Subir", "Procesar", "Datos", "Comidas", "Ingredientes", "Complementos", "Duplicados", "Confirmar"];
  const data = wizard.data?.structured_data;
  const [edits, setEdits] = useState<{ name?: string; objective?: string }>({});
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = (event.currentTarget.elements.namedItem("pdf") as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const result = await api("/api/plans/upload", { method: "POST", body: file, headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) } });
      setWizard({ step: 1, data: result });
      toast.success("PDF procesado", { description: "Revisa los campos detectados antes de confirmar." });
      await refresh();
    } catch (err) {
      toast.error("No se pudo procesar el PDF", { description: getErrorMessage(err) });
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="modal upload-wizard-modal">
        <header>
          <div className="row between">
            <h2>Creación de Plan Nutricional</h2>
            <Button variant="ghost" size="icon-sm" title="Cerrar" aria-label="Cerrar" onClick={() => setWizard(null)}>
              <X size={16} />
            </Button>
          </div>
          <Stepper12 steps={steps.map((label) => ({ label }))} currentStep={wizard.step} />
        </header>
        <main>
          {!data ? (
            <form className="form" onSubmit={upload}>
              <p>Sube el PDF privado del plan. El MVP guarda el archivo localmente y extrae estructura inicial cuando el texto esta disponible.</p>
              <input name="pdf" type="file" accept="application/pdf" required />
              <Button type="submit">Procesar PDF</Button>
            </form>
          ) : (
            <WizardStep data={data} step={wizard.step} edits={edits} setEdits={setEdits} />
          )}
        </main>
        <footer className="row between">
          <Button variant="outline" disabled={wizard.step === 0} onClick={() => setWizard({ ...wizard, step: Math.max(0, wizard.step - 1) })}>Anterior</Button>
          <div className="toolbar">
            {data && wizard.step < 7 && <Button variant="secondary" onClick={() => setWizard({ ...wizard, step: wizard.step + 1 })}>Siguiente</Button>}
            {wizard.step === 7 && <Button onClick={async () => { try { const changes = Object.fromEntries(Object.entries(edits).map(([key, value]) => [key, value?.trim()]).filter(([, value]) => value)); await api(`/api/plans/${wizard.data.plan.id}`, { method: "PATCH", body: JSON.stringify({ processing_status: "confirmed", ...changes }) }); setWizard(null); toast.success("Plan confirmado"); await refresh(); } catch (err) { toast.error("No se pudo confirmar el plan", { description: getErrorMessage(err) }); } }}><CheckCircle2 size={16} />Confirmar plan</Button>}
          </div>
        </footer>
      </section>
    </div>
  );
}

function WizardStep({ data, step, edits, setEdits }: { data: any; step: number; edits: { name?: string; objective?: string }; setEdits: (edits: { name?: string; objective?: string }) => void }) {
  const meals: any[] = data.meals || [];
  const options = meals.flatMap((meal) => meal.options);
  const ingredientCount = options.reduce((sum: number, option: any) => sum + option.recipe.ingredients.length, 0);
  const complements = meals.flatMap((meal) => meal.add_ons || []);
  const toReview = options.filter((option: any) => option.requires_review).length;
  const summary = data.nutrition_summary || {};
  const line = (item: any) => `${qty(item.quantity)} ${item.unit} ${item.name}`.replace(/\s+/g, " ").trim();

  if (step === 1) {
    return (
      <div className="card review-card">
        <div>
          <h3>Procesamiento completado</h3>
          <p className="review-status"><strong>Detectado:</strong> {plural(meals.length, "comida", "comidas")}, {plural(options.length, "opción", "opciones")}, {plural(ingredientCount, "ingrediente", "ingredientes")} y {plural(complements.length, "complemento", "complementos")}.</p>
        </div>
        <p className="review-note">{!meals.length ? data.recommendations : toReview ? `${plural(toReview, "opción necesita", "opciones necesitan")} revisión antes de confirmar.` : "Todo se leyó con buena confianza. Revisa los datos y confirma."}</p>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="list">
        <label>Nombre<input value={edits.name ?? data.name} onChange={(event) => setEdits({ ...edits, name: event.target.value })} /></label>
        <label>Objetivo<input value={edits.objective ?? data.objective} onChange={(event) => setEdits({ ...edits, objective: event.target.value })} /></label>
        {summary.kcal && (
          <div className="item">
            <h3>{summary.kcal} kcal al día</h3>
            {summary.macros && <p>Carbohidratos {summary.macros.carbohidratos}% · Proteínas {summary.macros.proteinas}% · Lípidos {summary.macros.lipidos}%</p>}
          </div>
        )}
      </div>
    );
  }
  if (step === 3) {
    return (
      <div className="list">
        {meals.length ? meals.map((meal, index) => (
          <div className="item" key={index}>
            <div className="row between"><h3>{mealLabel(meal.name)}</h3>{meal.time_window && <Badge>{formatTime(meal.time_window)}</Badge>}</div>
            <p>{meal.options.map((option: any) => option.recipe.name).join(" · ")}</p>
            {meal.equivalents && <p className="wizard-muted">Equivalentes: {Object.entries(meal.equivalents).map(([group, amount]) => `${group} ${amount}`).join(" · ")}</p>}
          </div>
        )) : <Empty message="No se detectaron comidas en el PDF." />}
      </div>
    );
  }
  if (step === 4) {
    return (
      <div className="list">
        {meals.flatMap((meal, mealIndex) => meal.options.map((option: any, optionIndex: number) => (
          <div className={`item ${option.requires_review ? "warning" : ""}`} key={`${mealIndex}-${optionIndex}`}>
            <div className="row between"><h3>{mealLabel(meal.name)} · {option.recipe.name}</h3><Badge tone={option.requires_review ? "warn" : "success"}>confianza {Math.round(option.confidence_score * 100)}%</Badge></div>
            <ul className="ingredient-lines">
              {option.recipe.ingredients.map((item: any, index: number) => <li key={index}><strong>{line(item)}</strong>{item.notes ? <span> · {item.notes}</span> : null}</li>)}
            </ul>
          </div>
        )))}
        {!options.length && <Empty message="No se detectaron ingredientes." />}
      </div>
    );
  }
  if (step === 5) {
    return (
      <div className="list">
        {meals.filter((meal) => meal.add_ons?.length).map((meal, index) => (
          <div className="item" key={index}>
            <h3>{mealLabel(meal.name)}</h3>
            {meal.add_ons.map((addOn: any, addOnIndex: number) => (
              <p key={addOnIndex}>
                <strong>{addOn.name}:</strong>{" "}
                {addOn.ingredients.map((item: any, index: number) => <span key={index}>{index ? " + " : ""}{line(item)}{item.notes ? <em className="wizard-note"> ({item.notes})</em> : null}</span>)}
              </p>
            ))}
          </div>
        ))}
        {!complements.length && <Empty message="No se detectaron complementos por comida." />}
        <div className="two">
          <div className="card"><h3>Suplementos</h3><p>{(data.supplements || []).map((item: any) => item.name).join(", ") || "Sin suplementos"}</p></div>
          <div className="card"><h3>Recomendaciones</h3><p className="pre-line">{data.recommendations}</p></div>
        </div>
      </div>
    );
  }
  if (step === 6) return <div className="card"><h3>Duplicados</h3><p>Las recetas con los mismos ingredientes, cantidades y unidades se reutilizan en lugar de duplicarse.</p></div>;
  return <div className="card"><h3>Listo para confirmar</h3><p>Al confirmar, el plan queda activo y listo para planificar compras.</p></div>;
}
