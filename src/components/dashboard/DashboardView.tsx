"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useDismiss } from "@/components/useDismiss";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardCheck, Dumbbell, FileUp, Filter, Flame, Minus, Pencil, Plus, Search, ShoppingBag, ShoppingCart, Utensils } from "lucide-react";
import {
  DayLog,
  Meal,
  WATER_GLASS_LITERS,
  WATER_GOAL_LITERS,
  addDays,
  dateKey,
  equivalentGroup,
  foodGroup,
  foodIcon,
  formatTime,
  isReadableName,
  mealLabel,
  mealStyle,
  mealTime,
  mealTitle,
  parseKey,
  plural,
  qty
} from "./food";
import { MAX_MESSAGE, SCOPE_LABEL, messageLength, type ScopeKey } from "@/lib/assistant";
import "./home.css";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const EMPTY_LOG: DayLog = { meals_done: [], water_glasses: 0 };

type Props = {
  data: any;
  refresh: () => Promise<void>;
  setView: (view: any) => void;
  setWizard: (wizard: { step: number; data: any } | null) => void;
  user: any;
  goals: { weight_goal_kg: number | null; activity_goal_days: number };
  askAssistant: (message: string, scope: ScopeKey) => Promise<void>;
  assistantBusy: boolean;
};

type Logs = { get: (date: string) => DayLog; latest: (date: string) => DayLog; all: () => [string, DayLog][]; save: (date: string, patch: Partial<DayLog>) => Promise<void> };

async function send(path: string, method: string, body: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

function useDailyLogs(serverLogs: ({ date: string } & DayLog)[], refresh: () => Promise<void>): Logs {
  const toMap = () =>
    Object.fromEntries((serverLogs || []).map(({ date, meals_done, water_glasses, weight_kg, exercised }) => [date, { meals_done, water_glasses, weight_kg: weight_kg ?? null, exercised: Boolean(exercised) }]));
  const [logs, setLogs] = useState<Record<string, DayLog>>(toMap);
  const pending = useRef(0);
  // The newest logs, for callbacks that outlive the render that made them (the undo toast).
  const current = useRef(logs);
  current.current = logs;

  useEffect(() => {
    if (!pending.current) setLogs(toMap());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLogs]);

  async function save(date: string, patch: Partial<DayLog>) {
    const previous = logs[date];
    setLogs((current) => ({ ...current, [date]: { ...EMPTY_LOG, ...current[date], ...patch } }));
    pending.current += 1;
    try {
      await send(`/api/daily-logs/${date}`, "PUT", patch);
    } catch {
      setLogs((current) => ({ ...current, [date]: previous ?? EMPTY_LOG }));
      toast.error("No se pudo guardar tu registro del día");
    } finally {
      pending.current -= 1;
      if (!pending.current) void refresh();
    }
  }

  return { get: (date) => logs[date] ?? EMPTY_LOG, latest: (date) => current.current[date] ?? EMPTY_LOG, all: () => Object.entries(logs), save };
}

// Minutes since midnight, read only after mount so the server and client render the same first frame.
function useClock() {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const now = new Date();
      setMinutes(now.getHours() * 60 + now.getMinutes());
    };
    read();
    const timer = window.setInterval(read, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return minutes;
}

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

const order = (index: number) => ({ "--i": index }) as CSSProperties;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A number that rolls to its new value: up when it grows, down when it shrinks, so the change reads at a glance.
function Roll({ value }: { value: number | string }) {
  const previous = useRef(value);
  const direction = Number(value) < Number(previous.current) ? "down" : "up";
  useEffect(() => {
    previous.current = value;
  }, [value]);
  return (
    <span className="home-roll" key={String(value)} data-dir={direction}>
      {value}
    </span>
  );
}

export function DashboardView({ data, user, goals: serverGoals, setView, setWizard, refresh, askAssistant, assistantBusy }: Props) {
  const today = dateKey(new Date());
  const [selected, setSelected] = useState(today);
  const [stripStart, setStripStart] = useState(() => addDays(today, -1));
  const [times, setTimes] = useState<Record<string, string>>({});
  const logs = useDailyLogs(data.dashboard.dailyLogs, refresh);

  const schedule = data.dashboard.schedule as { plan_name: string; water_goal_liters: number | null; meals: Meal[] } | null;
  const waterGlasses = Math.min(12, Math.max(4, Math.round((schedule?.water_goal_liters ?? WATER_GOAL_LITERS) / WATER_GLASS_LITERS)));
  const meals: Meal[] = (schedule?.meals ?? []).map((meal) => ({ ...meal, time_window: times[meal.id] ?? meal.time_window }));
  const mealIds = new Set(meals.map((meal) => meal.id));
  const doneOn = (date: string) => Math.min(meals.length, logs.get(date).meals_done.filter((id) => mealIds.has(id)).length);
  const openWizard = () => setWizard({ step: 0, data: null });

  const pendingToday = meals.length - doneOn(today);
  const firstName = String(user.name || "").split(" ")[0];
  const dayLabel = selected === today ? "Hoy" : parseKey(selected).toLocaleDateString("es-MX", { weekday: "long", day: "numeric" });

  // Goals change optimistically and roll back if the save fails.
  const [goals, setGoals] = useState(serverGoals);
  useEffect(() => setGoals(serverGoals), [serverGoals]);
  async function saveGoals(patch: Partial<typeof goals>) {
    const previous = goals;
    setGoals((current) => ({ ...current, ...patch }));
    try {
      await send("/api/goals", "PUT", patch);
      void refresh();
    } catch {
      setGoals(previous);
      toast.error("No se pudo guardar tu meta");
    }
  }

  function toggleMeal(date: string, mealId: string) {
    setMeal(date, mealId, !logs.latest(date).meals_done.includes(mealId));
  }

  function setMeal(date: string, mealId: string, done: boolean) {
    const current = logs.latest(date).meals_done.filter((id) => id !== mealId);
    void logs.save(date, { meals_done: done ? [...current, mealId] : current });
  }

  async function saveTime(mealId: string, value: string) {
    setTimes((current) => ({ ...current, [mealId]: value }));
    try {
      await send(`/api/meal-types/${mealId}`, "PATCH", { time_window: value });
      toast.success("Horario guardado");
      await refresh();
    } catch {
      setTimes(({ [mealId]: _discarded, ...rest }) => rest);
      toast.error("No se pudo guardar el horario");
    }
  }

  return (
    <div className="home">
      <header className="home-head home-rise" style={order(0)}>
        <div className="home-hello">
          <h1>
            Hola, <strong>{firstName}</strong>
          </h1>
          <p>
            {!meals.length ? (
              "Sube tu plan para organizar tus comidas."
            ) : pendingToday > 0 ? (
              <>
                Tienes <b><Roll value={pendingToday} /></b> {pendingToday === 1 ? "comida pendiente" : "comidas pendientes"} hoy
              </>
            ) : (
              "Completaste todas tus comidas de hoy"
            )}
          </p>
        </div>
        <SearchBar onAsk={askAssistant} busy={assistantBusy} />
      </header>

      <div className="home-grid">
        <DayCard
          meals={meals}
          today={today}
          selected={selected}
          onSelect={setSelected}
          stripStart={stripStart}
          onShift={(amount: number) => setStripStart(addDays(stripStart, amount))}
          log={logs.get(selected)}
          onToggle={(mealId) => toggleMeal(selected, mealId)}
          onComplete={(mealId, done) => setMeal(today, mealId, done)}
          onSaveTime={saveTime}
          onUpload={openWizard}
        />
        <ReportCard
          meals={meals}
          logs={logs}
          today={today}
          waterGlasses={waterGlasses}
          goals={goals}
          doneOn={doneOn}
          onSaveDay={(date, patch) => void logs.save(date, patch)}
          onSaveGoals={(patch) => void saveGoals(patch)}
        />
        <ShoppingCard list={data.latestList} cartIngredients={data.cart.ingredients} refresh={refresh} onOpen={() => setView("lists")} onPlan={() => setView("planning")} />
        <IntakeCard
          meals={meals}
          log={logs.get(selected)}
          label={dayLabel}
          goalGlasses={waterGlasses}
          isFuture={selected > today}
          onWater={(glasses: number) => void logs.save(selected, { water_glasses: glasses })}
        />
        <PromoCard onUpload={openWizard} />
      </div>
    </div>
  );
}

/* ---------- Greeting search: questions go to the assistant ---------- */

const ASSISTANT_SCOPES = (["auto", "Plan activo", "Recetario", "Carrito"] as const).map((value) => ({ value, label: SCOPE_LABEL[value] }));

// `busy` is the assistant's: a pending question blocks the bar until it settles or Nueva conversación discards it.
function SearchBar({ onAsk, busy }: { onAsk: (message: string, scope: ScopeKey) => Promise<void>; busy: boolean }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeKey>("auto");
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), menu);
  const current = ASSISTANT_SCOPES.find((item) => item.value === scope) ?? ASSISTANT_SCOPES[0];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = query.trim();
    // Over the limit it is not sent (REQ-13); the text stays so it can be shortened.
    if (!message || busy || messageLength(query) > MAX_MESSAGE) return;
    // The question moves into the assistant panel right away, so the field clears on send, not when the answer lands.
    setQuery("");
    await onAsk(message, scope);
  }

  return (
    <form className="home-search" role="search" onSubmit={submit}>
      <Search size={20} aria-hidden />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={scope === "auto" ? "Pregunta por tu plan, recetas o compras" : `Pregunta sobre ${current.label.toLowerCase()}`}
        aria-label="Preguntar al asistente"
        enterKeyHint="send"
        disabled={busy}
      />
      <div className="home-search-scope" ref={menu}>
        <button type="button" className={`home-search-filter${scope === "auto" ? "" : " is-on"}`} aria-haspopup="menu" aria-expanded={open} aria-label={`Buscar en: ${current.label}`} disabled={busy} onClick={() => setOpen(!open)}>
          <Filter size={18} />
        </button>
        {open && (
          <div className="popover home-scope-menu" role="menu">
            <p>Buscar en</p>
            {ASSISTANT_SCOPES.map((item) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={item.value === scope}
                key={item.value}
                onClick={() => {
                  setScope(item.value);
                  setOpen(false);
                }}
              >
                {item.label}
                {item.value === scope && <Check size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

/* ---------- The day: a tall schedule; the next meal opens up with its ingredients and actions ---------- */

function DayCard(props: {
  meals: Meal[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  stripStart: string;
  onShift: (amount: number) => void;
  log: DayLog;
  onToggle: (mealId: string) => void;
  onComplete: (mealId: string, done: boolean) => void;
  onSaveTime: (mealId: string, value: string) => void;
  onUpload: () => void;
}) {
  const { meals, today, selected, log } = props;
  const [editing, setEditing] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const clock = useClock();
  const days = Array.from({ length: 5 }, (_, index) => addDays(props.stripStart, index));
  const isFuture = selected > today;
  const next = selected === today ? meals.find((meal) => !log.meals_done.includes(meal.id)) : undefined;
  const nextId = next?.id;
  const scrolled = useRef(false);

  // Keep the meal that's up next in view inside the scrolling list: instantly on load; after a check-off, once the
  // finished meal has folded and the next one opened (250ms), so the row is measured where it ends up.
  useEffect(() => {
    const reveal = () => {
      const box = list.current;
      const row = box?.querySelector<HTMLElement>("li.is-next");
      if (!box || !row) return;
      const above = row.offsetTop < box.scrollTop;
      const below = row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight;
      if (above || below) box.scrollTo({ top: Math.max(0, row.offsetTop - 12), behavior: scrolled.current && !reducedMotion() ? "smooth" : "auto" });
    };
    if (!scrolled.current) {
      reveal();
      scrolled.current = true;
      return;
    }
    const timer = window.setTimeout(reveal, 260);
    return () => window.clearTimeout(timer);
  }, [nextId, selected]);

  // The yellow pill is a styled copy of the strip, clipped to the selected day; moving the clip slides it across.
  const strip = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ clip: string; visible: boolean } | null>(null);
  const [shift, setShift] = useState<"next" | "prev" | null>(null);
  useLayoutEffect(() => {
    const box = strip.current;
    if (!box) return;
    const measure = () => {
      const day = box.querySelector<HTMLElement>(".home-strip-days .home-daypill.is-selected");
      if (!day) return setPill((current) => (current ? { ...current, visible: false } : null));
      const right = box.clientWidth - day.offsetLeft - day.offsetWidth;
      setPill({ clip: `inset(0 ${right}px 0 ${day.offsetLeft}px round 999px)`, visible: true });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [selected, props.stripStart]);

  function shiftDays(amount: number) {
    setShift(amount > 0 ? "next" : "prev");
    props.onShift(amount);
  }

  function complete(meal: Meal) {
    const title = mealTitle(meal);
    props.onComplete(meal.id, true);
    toast.success(`${title} marcada como hecha`, { action: { label: "Deshacer", onClick: () => props.onComplete(meal.id, false) }, duration: 6000 });
  }

  const title =
    selected === today
      ? "Comidas de hoy"
      : selected === addDays(today, -1)
        ? "Comidas de ayer"
        : selected === addDays(today, 1)
          ? "Comidas de mañana"
          : `Comidas del ${parseKey(selected).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`;

  return (
    <section className="home-card home-day home-rise" style={order(1)} aria-labelledby="day-title">
      <header className="home-card-head">
        <h2 id="day-title">
          <CalendarClock size={20} /> {title}
        </h2>
        {meals.length > 0 && (
          <button
            type="button"
            className={`home-icon-btn${editing ? " is-on" : ""}`}
            aria-pressed={editing}
            aria-label={editing ? "Terminar de editar horarios" : "Editar horarios"}
            title={editing ? "Listo" : "Editar horarios"}
            onClick={() => setEditing(!editing)}
          >
            {editing ? <Check size={16} /> : <Pencil size={16} />}
          </button>
        )}
      </header>

      <div className={`home-strip${pill ? " is-ready" : ""}`} role="group" aria-label="Elegir día" ref={strip} data-shift={shift ?? undefined}>
        <div className="home-strip-days">
          <button type="button" className="home-chev" aria-label="Días anteriores" onClick={() => shiftDays(-5)}>
            <ChevronLeft size={18} />
          </button>
          {days.map((key) => {
            const date = parseKey(key);
            return (
              <button
                type="button"
                key={key}
                className={`home-daypill${key === selected ? " is-selected" : ""}${key === today ? " is-today" : ""}`}
                aria-pressed={key === selected}
                aria-label={date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
                onClick={() => props.onSelect(key)}
              >
                <b>{date.getDate()}</b>
                <small>{WEEKDAYS[date.getDay()]}</small>
              </button>
            );
          })}
          <button type="button" className="home-chev" aria-label="Días siguientes" onClick={() => shiftDays(5)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className={`home-strip-pill${pill?.visible ? " is-on" : ""}`} aria-hidden style={pill ? { clipPath: pill.clip } : undefined}>
          <span className="home-chev" />
          {days.map((key) => {
            const date = parseKey(key);
            return (
              <span key={key} className="home-daypill">
                <b>{date.getDate()}</b>
                <small>{WEEKDAYS[date.getDay()]}</small>
              </span>
            );
          })}
          <span className="home-chev" />
        </div>
      </div>

      {meals.length ? (
        // Keyed on the day so switching days brings the list in fresh instead of swapping text in place.
        <ol className="home-timeline" key={selected} ref={list}>
          {meals.map((meal, index) => {
            const checked = log.meals_done.includes(meal.id);
            const ingredients = meal.recipe?.ingredients ?? [];
            const title = mealTitle(meal);
            const time = mealTime(meal, meals);
            const style = mealStyle(meal.name);
            const isNext = meal === next;
            const late = isNext && clock !== null && toMinutes(time) <= clock;
            return (
              <li key={meal.id} className={`${checked ? "is-done" : ""}${isNext ? " is-next" : ""}`} style={order(index)}>
                <button
                  type="button"
                  className="home-check"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={isFuture}
                  title={isFuture ? "Este día aún no llega" : undefined}
                  aria-label={`${mealLabel(meal.name)}: ${checked ? "marcar como pendiente" : "marcar como hecha"}`}
                  onClick={() => props.onToggle(meal.id)}
                >
                  {checked && <Check size={14} strokeWidth={3} />}
                </button>
                <div className="home-meal">
                  {editing ? (
                    <TimeInput value={time} label={mealLabel(meal.name)} onSave={(value) => props.onSaveTime(meal.id, value)} />
                  ) : (
                    <time>
                      {formatTime(time)}
                      {isNext && <span className="home-now-flag">{late ? "Te toca ahora" : "Siguiente"}</span>}
                    </time>
                  )}
                  <strong>{title}</strong>
                  <span className="home-meal-meta">
                    <span className={`home-tag tone-${style.tone}`}>{mealLabel(meal.name)}</span>
                    <span className="home-chip">
                      <Utensils size={12} /> {plural(ingredients.length, "ingrediente", "ingredientes")}
                    </span>
                    {meal.options_count > 1 && <span className="home-chip">{plural(meal.options_count, "opción", "opciones")}</span>}
                  </span>
                  {next && (
                    <div className="home-next-wrap" inert={!isNext} aria-hidden={!isNext}>
                    <div className="home-next-clip">
                    <div className="home-next">
                      {ingredients.length > 0 && (
                        <ul className="home-ingredients">
                          {ingredients.slice(0, 4).map((item, itemIndex) => {
                            const ok = isReadableName(item.name);
                            return (
                              <li key={`${item.name}:${itemIndex}`} className={ok ? undefined : "is-unreadable"} title={ok ? undefined : "El nombre no se pudo leer del PDF"}>
                                <img src={foodIcon(item.name, item.category)} alt="" width={24} height={24} loading="lazy" />
                                <span>{ok ? item.name.trim() : "Por revisar"}</span>
                                <small>{`${qty(item.quantity)} ${item.unit}`.trim()}</small>
                              </li>
                            );
                          })}
                          {ingredients.length > 4 && <li className="home-ingredients-more">+{ingredients.length - 4}</li>}
                        </ul>
                      )}
                      <div className="home-next-actions">
                        <button type="button" className="home-btn" onClick={() => complete(meal)}>
                          <Check size={16} strokeWidth={2.5} /> Marcar como hecha
                        </button>
                        {meal.recipe && (
                          <Link href={`/recipes/${meal.recipe.id}`} className="home-btn is-quiet">
                            Ver receta <ArrowRight size={16} />
                          </Link>
                        )}
                      </div>
                    </div>
                    </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="home-empty">
          <img src="/food/plate.png" alt="" width={64} height={64} />
          <p>Cuando subas el plan de tu nutriólogo, aquí verás cada comida del día con su horario.</p>
          <button type="button" className="home-btn" onClick={props.onUpload}>
            <FileUp size={16} /> Subir plan
          </button>
        </div>
      )}
    </section>
  );
}

function TimeInput({ value, label, onSave }: { value: string; label: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="time"
      className="home-time-input"
      value={draft}
      aria-label={`Hora de ${label}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft && draft !== value) onSave(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

/* ---------- Intake and water ---------- */

const liters = (value: number) => value.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

type Group = { key: string; label: string; short: string; color: string; icon: string };

function intakeGroups(meals: Meal[], log: DayLog) {
  const groups = new Map<string, { group: Group; total: number; done: number }>();
  const add = (group: Group | null, amount: number, eaten: boolean) => {
    if (!group || !amount) return;
    const entry = groups.get(group.key) ?? { group, total: 0, done: 0 };
    entry.total += amount;
    if (eaten) entry.done += amount;
    groups.set(group.key, entry);
  };
  // Prefer the nutritionist's equivalents table; fall back to counting ingredients by category.
  const byEquivalents = meals.some((meal) => meal.equivalents && Object.keys(meal.equivalents).length);
  for (const meal of meals) {
    const eaten = log.meals_done.includes(meal.id);
    if (byEquivalents) Object.entries(meal.equivalents ?? {}).forEach(([name, amount]) => add(equivalentGroup(name), amount, eaten));
    else (meal.recipe?.ingredients ?? []).forEach((ingredient) => add(foodGroup(ingredient.category), 1, eaten));
  }
  return { top: [...groups.values()].sort((a, b) => b.total - a.total).slice(0, 3), unit: byEquivalents ? "equivalentes" : "porciones" };
}

function IntakeCard({ meals, log, label, goalGlasses, isFuture, onWater }: { meals: Meal[]; log: DayLog; label: string; goalGlasses: number; isFuture: boolean; onWater: (glasses: number) => void }) {
  const { top, unit } = intakeGroups(meals, log);
  const glasses = Math.min(log.water_glasses, goalGlasses);
  return (
    <section className="home-card home-intake home-rise" style={order(4)} aria-labelledby="intake-title">
      <header className="home-card-head">
        <h2 id="intake-title">
          <Utensils size={20} /> Ingesta del día
        </h2>
        {label !== "Hoy" && <span className="home-count">{label}</span>}
      </header>
      {top.length ? (
        <ul className="home-intake-list">
          {top.map(({ group, total, done }) => (
            <li key={group.key} style={{ "--group": group.color } as CSSProperties} title={`${group.label}: ${done} de ${total} ${unit}`}>
              {/* A rounded-square ring that fills clockwise from the top, where the food icon sits. */}
              <svg viewBox="0 0 100 100" aria-hidden>
                <path className="home-intake-track" d={RING_PATH} pathLength={100} />
                <path className="home-intake-bar" d={RING_PATH} pathLength={100} strokeDasharray="100 100" strokeDashoffset={100 - (total ? (done / total) * 100 : 0)} />
              </svg>
              <img src={`/food/${group.icon}.png`} alt="" width={28} height={28} />
              <span className="home-intake-text">
                <small>{group.short}</small>
                <b>
                  <Roll value={done} />/{total}
                </b>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-note">Verás tus grupos de alimentos cuando el plan tenga ingredientes legibles.</p>
      )}
      <div className="home-water">
        <p>
          Agua{" "}
          <b>
            <Roll value={liters(glasses * WATER_GLASS_LITERS)} />/{liters(goalGlasses * WATER_GLASS_LITERS)} L
          </b>
        </p>
        <div className="home-cups" role="group" aria-label="Vasos de agua de 250 ml">
          {Array.from({ length: goalGlasses }, (_, index) => {
            const filled = index < glasses;
            const nextCup = index === glasses && !isFuture;
            return (
              <button
                type="button"
                key={index}
                className={`home-cup${filled ? " is-full" : ""}${nextCup ? " is-next" : ""}`}
                disabled={isFuture}
                aria-pressed={filled}
                aria-label={filled ? `Quitar vaso ${index + 1}` : `Registrar vaso ${index + 1}`}
                // Tapping the last full glass empties it; any other glass sets the count to that glass.
                onClick={() => onWater(filled && index + 1 === glasses ? index : index + 1)}
              >
                <svg viewBox="0 0 24 30" aria-hidden>
                  <path className="home-cup-glass" d={CUP_PATH} />
                  <path className="home-cup-water" d={CUP_WATER_PATH} style={order(index)} />
                </svg>
                {nextCup && (
                  <span className="home-cup-plus" aria-hidden>
                    <Plus size={10} strokeWidth={3.2} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// A glass that narrows toward its base; the water is the same shape inset from the walls.
const CUP_PATH = "M3 3h18l-2.2 22.6a2.2 2.2 0 0 1-2.2 2H7.4a2.2 2.2 0 0 1-2.2-2Z";
const CUP_WATER_PATH = "M5.2 9h13.6l-1.7 16.1a1 1 0 0 1-1 0.9H7.9a1 1 0 0 1-1-0.9Z";

// Rounded square (inset 6, corner radius 26) starting at the top center and running clockwise.
const RING_PATH = "M50 6 H68 A26 26 0 0 1 94 32 V68 A26 26 0 0 1 68 94 H32 A26 26 0 0 1 6 68 V32 A26 26 0 0 1 32 6 Z";

/* ---------- Weekly report ---------- */

type Goals = { weight_goal_kg: number | null; activity_goal_days: number };

function ReportCard(props: {
  meals: Meal[];
  logs: Logs;
  today: string;
  waterGlasses: number;
  goals: Goals;
  doneOn: (date: string) => number;
  onSaveDay: (date: string, patch: Partial<DayLog>) => void;
  onSaveGoals: (patch: Partial<Goals>) => void;
}) {
  const { meals, logs, today, goals, doneOn } = props;
  const monday = addDays(today, -((parseKey(today).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const sofar = week.filter((date) => date <= today);
  const total = meals.length;

  const weekWater = sofar.reduce((sum, date) => sum + Math.min(logs.get(date).water_glasses, props.waterGlasses), 0) * WATER_GLASS_LITERS;
  const weekWaterGoal = props.waterGlasses * WATER_GLASS_LITERS * 7;
  const weekMeals = sofar.reduce((sum, date) => sum + doneOn(date), 0);
  const exercised = week.filter((date) => logs.get(date).exercised);

  let streak = 0;
  let cursor = total && doneOn(today) >= total ? today : addDays(today, -1);
  while (total && streak < 366 && doneOn(cursor) >= total) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return (
    <section className="home-card home-report home-rise" style={order(5)} aria-labelledby="report-title">
      <header className="home-card-head">
        <h2 id="report-title">
          <ClipboardCheck size={18} /> Reporte semanal
        </h2>
        <span className="home-count">
          {parseKey(monday).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} – {parseKey(week[6]).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
        </span>
      </header>
      <div className="home-tiles">
        <WeightTile logs={logs} today={today} monday={monday} goal={goals.weight_goal_kg} onSaveDay={props.onSaveDay} onSaveGoals={props.onSaveGoals} />
        <ActivityTile week={week} today={today} done={exercised.length} goal={goals.activity_goal_days} logs={logs} onSaveDay={props.onSaveDay} onSaveGoals={props.onSaveGoals} />
        <div className="home-tile tone-water">
          <span className="home-tile-label">Agua de la semana</span>
          <span className="home-wave" style={{ transform: `translateY(${(1 - clamp(weekWater / weekWaterGoal)) * 72}%)` }} aria-hidden>
            <svg viewBox="0 0 200 24" preserveAspectRatio="none">
              <path className="home-wave-back" d="M0 12 C 34 0, 70 2, 104 12 S 170 24, 200 6 V24 H0Z" />
              <path className="home-wave-front" d="M0 16 C 40 6, 78 8, 116 16 S 176 22, 200 12 V24 H0Z" />
            </svg>
          </span>
          <p className="home-tile-value">
            <b>
              <Roll value={liters(weekWater)} /> L
            </b>
            <small>Meta {liters(weekWaterGoal)} L</small>
          </p>
        </div>
        <div className="home-tile tone-meals">
          <span className="home-tile-label">Comidas</span>
          <Gauge ratio={total ? weekMeals / (total * 7) : 0} tone="meals" icon={<Flame size={20} />} />
          <p className="home-tile-value">
            <b>
              <Roll value={weekMeals} /> <small>de {total * 7}</small>
            </b>
            <small>
              Racha <Roll value={streak} /> {streak === 1 ? "día" : "días"}
            </small>
          </p>
        </div>
      </div>
    </section>
  );
}

const clamp = (value: number) => Math.max(0, Math.min(1, value || 0));

// Half-ring gauge (radius 44) with an optional knob riding the end of the progress.
function Gauge({ ratio, tone, icon, knob }: { ratio: number; tone: string; icon?: React.ReactNode; knob?: boolean }) {
  const progress = clamp(ratio);
  const length = Math.PI * 44;
  return (
    <span className={`home-gauge tone-${tone}`} aria-hidden>
      <svg viewBox="0 0 120 66">
        <defs>
          <linearGradient id={`gauge-${tone}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" className="home-gauge-from" />
            <stop offset="1" className="home-gauge-to" />
          </linearGradient>
        </defs>
        <path className="home-gauge-track" d="M16 58 A44 44 0 0 1 104 58" />
        <path className="home-gauge-bar" d="M16 58 A44 44 0 0 1 104 58" stroke={`url(#gauge-${tone})`} strokeDasharray={`${length * progress} ${length}`} />
        {knob && (
          <g className="home-gauge-arm" style={{ transform: `rotate(${progress * 180}deg)` }}>
            <circle className="home-gauge-knob" cx="16" cy="58" r="7" />
          </g>
        )}
      </svg>
      {icon && <span className="home-gauge-icon">{icon}</span>}
    </span>
  );
}

const kg = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 1 });

function WeightTile({ logs, today, monday, goal, onSaveDay, onSaveGoals }: { logs: Logs; today: string; monday: string; goal: number | null; onSaveDay: (date: string, patch: Partial<DayLog>) => void; onSaveGoals: (patch: Partial<Goals>) => void }) {
  const [open, setOpen] = useState(false);
  const weights = logs
    .all()
    .filter(([date, log]) => date <= today && typeof log.weight_kg === "number")
    .sort(([a], [b]) => a.localeCompare(b)) as [string, DayLog & { weight_kg: number }][];
  const start = weights[0]?.[1].weight_kg ?? null;
  const latest = weights.at(-1)?.[1].weight_kg ?? null;
  const beforeWeek = weights.filter(([date]) => date < monday).at(-1)?.[1].weight_kg ?? null;
  const change = latest !== null && beforeWeek !== null ? latest - beforeWeek : null;
  // Progress from the first weight logged toward the goal, in whichever direction the goal lies.
  const ratio = latest !== null && start !== null && goal !== null ? (start === goal ? 1 : (start - latest) / (start - goal)) : 0;

  return (
    <div className="home-tile tone-weight">
      <button type="button" className="home-tile-hit" aria-haspopup="dialog" aria-expanded={open} aria-label="Registrar peso y meta" onClick={() => setOpen(true)} />
      <span className="home-tile-label">
        Peso
        {change !== null && change !== 0 && <small className="home-tile-badge">{`${change > 0 ? "+" : "−"}${kg(Math.abs(change))} kg esta semana`}</small>}
      </span>
      <Gauge ratio={ratio} tone="weight" knob={latest !== null && goal !== null} />
      {latest === null ? (
        <p className="home-tile-value">
          <b className="home-tile-empty">Registra tu peso</b>
          <small>Toca para empezar</small>
        </p>
      ) : (
        <p className="home-tile-value">
          <b>
            <Roll value={kg(latest)} /> kg
          </b>
          <small>{goal !== null ? `Meta ${kg(goal)} kg` : "Fija tu meta"}</small>
        </p>
      )}
      {open && (
        <WeightPopover
          weight={logs.get(today).weight_kg ?? latest}
          goal={goal}
          onClose={() => setOpen(false)}
          onSave={(weight, nextGoal) => {
            if (weight !== (logs.get(today).weight_kg ?? null)) onSaveDay(today, { weight_kg: weight });
            if (nextGoal !== goal) onSaveGoals({ weight_goal_kg: nextGoal });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function parseKg(value: string) {
  const number = Number(value.replace(",", "."));
  return value.trim() === "" ? null : Number.isFinite(number) ? Math.round(number * 10) / 10 : NaN;
}

function WeightPopover({ weight, goal, onSave, onClose }: { weight: number | null; goal: number | null; onSave: (weight: number | null, goal: number | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState({ weight: weight === null ? "" : String(weight), goal: goal === null ? "" : String(goal) });
  const [error, setError] = useState<string | null>(null);
  useDismiss(true, onClose, ref);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextWeight = parseKg(draft.weight);
    const nextGoal = parseKg(draft.goal);
    const bad = [nextWeight, nextGoal].some((value) => value !== null && (Number.isNaN(value) || value < 20 || value > 400));
    if (bad) return setError("Escribe un peso entre 20 y 400 kg.");
    onSave(nextWeight, nextGoal);
  }

  return (
    <form ref={ref} className="home-popover" role="dialog" aria-label="Peso y meta" onSubmit={submit} noValidate>
      <label>
        Peso de hoy
        <span className="home-input">
          <input autoFocus inputMode="decimal" value={draft.weight} placeholder="62.5" onChange={(event) => setDraft({ ...draft, weight: event.target.value })} aria-invalid={Boolean(error)} />
          <small>kg</small>
        </span>
      </label>
      <label>
        Meta
        <span className="home-input">
          <input inputMode="decimal" value={draft.goal} placeholder="56" onChange={(event) => setDraft({ ...draft, goal: event.target.value })} aria-invalid={Boolean(error)} />
          <small>kg</small>
        </span>
      </label>
      {error && (
        <p className="home-popover-error" role="alert">
          {error}
        </p>
      )}
      <div className="home-popover-actions">
        <button type="button" className="home-btn is-quiet" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="home-btn">
          Guardar
        </button>
      </div>
    </form>
  );
}

function ActivityTile({ week, today, done, goal, logs, onSaveDay, onSaveGoals }: { week: string[]; today: string; done: number; goal: number; logs: Logs; onSaveDay: (date: string, patch: Partial<DayLog>) => void; onSaveGoals: (patch: Partial<Goals>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const todayDone = Boolean(logs.get(today).exercised);
  return (
    <div className="home-tile tone-activity">
      <span className="home-tile-label">Actividad</span>
      <ol className="home-activity-days" aria-label={`Días con ejercicio: ${done} de ${goal}`}>
        {week.map((date) => (
          <li key={date} className={`${logs.get(date).exercised ? "is-done" : ""}${date === today ? " is-today" : ""}${date > today ? " is-future" : ""}`}>
            <i />
            <small>{WEEKDAYS[parseKey(date).getDay()].charAt(0)}</small>
          </li>
        ))}
      </ol>
      <button type="button" className={`home-activity-toggle${todayDone ? " is-on" : ""}`} aria-pressed={todayDone} onClick={() => onSaveDay(today, { exercised: !todayDone })}>
        {todayDone ? <Check size={16} strokeWidth={2.5} /> : <Dumbbell size={16} />} {todayDone ? "Ejercicio hecho" : "¿Ejercicio hoy?"}
      </button>
      <div className="home-tile-value" ref={ref}>
        <b>
          <Roll value={done} /> <small>de {goal} días</small>
        </b>
        <button type="button" className="home-tile-link" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
          Meta {goal} días
        </button>
        {open && (
          <div className="home-popover is-small" role="dialog" aria-label="Meta semanal de actividad">
            <span>Días por semana</span>
            <div className="home-stepper">
              <button type="button" aria-label="Menos días" disabled={goal <= 1} onClick={() => onSaveGoals({ activity_goal_days: goal - 1 })}>
                <Minus size={16} />
              </button>
              <b>
                <Roll value={goal} />
              </b>
              <button type="button" aria-label="Más días" disabled={goal >= 7} onClick={() => onSaveGoals({ activity_goal_days: goal + 1 })}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Shopping: the newest list, checkable; the cart when there's no list yet ---------- */

function ShoppingCard({ list, cartIngredients, refresh, onOpen, onPlan }: { list: any; cartIngredients: any[]; refresh: () => Promise<void>; onOpen: () => void; onPlan: () => void }) {
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const items: { id: string; name: string; category: string; amount: string; checked: boolean }[] = list
    ? (list.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.name_snapshot,
        category: item.category_snapshot,
        amount: `${qty(item.quantity_snapshot)} ${item.unit_snapshot}`.trim(),
        checked: item.status !== "Pendiente"
      }))
    : (cartIngredients ?? []).map((item: any) => ({ id: `${item.name}:${item.unit}`, name: item.name, category: item.category, amount: `${qty(item.quantity)} ${item.unit}`.trim(), checked: false }));
  const bought = items.filter((item) => optimistic[item.id] ?? item.checked).length;

  // Checks show immediately and hold until the refreshed list arrives, so nothing flickers back in between.
  useEffect(() => setOptimistic({}), [list]);

  async function toggle(itemId: string, checked: boolean) {
    setOptimistic((current) => ({ ...current, [itemId]: checked }));
    try {
      await send(`/api/shopping-lists/${list.id}/items/${itemId}`, "PATCH", { status: checked ? "Comprado" : "Pendiente" });
      void refresh();
    } catch {
      setOptimistic(({ [itemId]: _failed, ...rest }) => rest);
      toast.error("No se pudo actualizar el artículo");
    }
  }

  return (
    <section className="home-card home-shop home-rise" style={order(3)} aria-labelledby="shop-title">
      <header className="home-card-head">
        <h2 id="shop-title">
          <ShoppingCart size={20} /> {list ? "Lista de compras" : "Carrito"}
        </h2>
        <div className="home-card-tools">
          {list && items.length > 0 && (
            <span className="home-count">
              <Roll value={bought} /> de {items.length}
            </span>
          )}
          <button type="button" className="home-icon-btn is-dark" aria-label={list ? "Ver lista de compras" : "Ver carrito"} title={list ? "Ver lista" : "Ver carrito"} onClick={onOpen}>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </header>
      {items.length ? (
        <ul className="home-shop-list">
          {items.map((item) => {
            const checked = optimistic[item.id] ?? item.checked;
            const readable = isReadableName(item.name);
            const name = readable ? item.name.trim() : "Ingrediente por revisar";
            return (
              <li key={item.id} className={checked ? "is-checked" : undefined}>
                {list ? (
                  <button type="button" className="home-box" role="checkbox" aria-checked={checked} aria-label={`${name}: ${checked ? "marcar como pendiente" : "marcar como comprado"}`} onClick={() => toggle(item.id, !checked)}>
                    {checked && <Check size={14} strokeWidth={3} />}
                  </button>
                ) : (
                  <span className="home-box is-placeholder" aria-hidden />
                )}
                <img src={foodIcon(item.name, item.category)} alt="" width={32} height={32} loading="lazy" />
                <span className={readable ? "home-shop-name" : "home-shop-name is-unreadable"} title={readable ? undefined : "El nombre no se pudo leer del PDF"}>
                  {name}
                </span>
                <small>{item.amount}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="home-note">Tu carrito está vacío. Planifica unos días y armamos la lista por ti.</p>
      )}
      <button type="button" className="home-btn is-yellow" onClick={list ? onOpen : onPlan}>
        <ShoppingBag size={18} /> {list ? "Ir de compras" : "Planificar compras"}
      </button>
    </section>
  );
}

/* ---------- Promo: a new plan from the nutritionist ---------- */

// A wide banner: food art bleeding off the left edge, the pitch and what a plan becomes, one button on the right.
function PromoCard({ onUpload }: { onUpload: () => void }) {
  return (
    <section className="home-promo home-rise" style={order(5)} aria-labelledby="promo-title">
      <div className="home-promo-layout">
        <div className="home-promo-art" aria-hidden>
          <img className="home-promo-dish" src="/food/pot-food.png" alt="" width={176} height={176} />
          <img className="home-promo-float f0" src="/food/avocado.png" alt="" width={44} height={44} />
          <img className="home-promo-float f1" src="/food/strawberry.png" alt="" width={36} height={36} />
        </div>
        <div className="home-promo-copy">
          <h2 id="promo-title">¿Nuevo plan de tu nutriólogo?</h2>
          <p>Súbelo en PDF y lo convertimos en tu día a día, listo para seguir.</p>
          <ul className="home-promo-tags">
            <li>Horarios por comida</li>
            <li>Recetas con ingredientes</li>
            <li>Lista de compras</li>
          </ul>
        </div>
        <button type="button" className="home-promo-btn" onClick={onUpload}>
          <Plus size={18} strokeWidth={2.5} /> Subir plan
        </button>
      </div>
    </section>
  );
}
