"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Check, Search } from "lucide-react";
import { useShell } from "@/components/app/AppShell";
import { foodIcon, isReadableName, qty } from "@/components/dashboard/food";
import { useRecipeActions } from "@/components/recipes/useRecipeActions";
import { api, getErrorMessage } from "@/lib/client/api";
import type { listGroceries } from "@/lib/domain/queries";
import { AddToCartButton } from "./AddToCartButton";

type Grocery = ReturnType<typeof listGroceries>[number];
type Props = {
  groceries: Grocery[];
  recipes: { id: string; name: string; active: boolean }[];
  activePlan: string | null;
};

const PERIODS = [5, 7, 14];

export function GroceriesView({ groceries, recipes, activePlan }: Props) {
  const { addIngredient } = useRecipeActions();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(groceries.map((item) => item.category))], [groceries]);
  const term = search.trim().toLowerCase();
  const visible = groceries.filter((item) => (!category || item.category === category) && (!term || item.name.toLowerCase().includes(term)));

  return (
    <div className="groceries-stack">
      <PeriodPlanner recipes={recipes} activePlan={activePlan} />
      <section className="order-card">
        <header className="order-head">
          <div>
            <h1>Ingredientes</h1>
            <p>{groceries.length} ingredientes de tus recetas. Agrégalos uno por uno al carrito.</p>
          </div>
        </header>
        <div className="order-tools">
          <label className="order-search">
            <Search size={17} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ingrediente" aria-label="Buscar ingrediente" />
          </label>
          <div className="order-chips" role="group" aria-label="Categoría">
            <button type="button" className={category ? "order-chip" : "order-chip on"} aria-pressed={!category} onClick={() => setCategory(null)}>Todas</button>
            {categories.map((name) => (
              <button key={name} type="button" className={category === name ? "order-chip on" : "order-chip"} aria-pressed={category === name} onClick={() => setCategory(category === name ? null : name)}>{name}</button>
            ))}
          </div>
        </div>
        {visible.length ? (
          <ul className="order-list">
            {visible.map((item) => {
              const readable = isReadableName(item.name);
              const usedIn = item.recipes.slice(0, 2).map((recipe) => recipe.name).join(", ") + (item.recipes.length > 2 ? ` y ${item.recipes.length - 2} más` : "");
              return (
                <li key={item.name} className="order-row">
                  <span className="order-thumb"><img src={foodIcon(item.name, item.category)} alt="" width={36} height={36} loading="lazy" /></span>
                  <div className="order-info">
                    <strong className={readable ? "" : "unreadable"}>{readable ? item.name : "Ingrediente por revisar"}</strong>
                    <p>{item.category} · En {usedIn}</p>
                  </div>
                  <span className="order-qty">{qty(item.quantity)} {item.unit}</span>
                  <AddToCartButton className="order-add" label={`Agregar ${item.name} al carrito`} onAdd={() => addIngredient(item)} />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">{groceries.length ? "Ningún ingrediente coincide con la búsqueda." : "Los ingredientes aparecerán al procesar tu primer plan."}</div>
        )}
      </section>
    </div>
  );
}

// Former Planificación page: send whole recipes to the cart for a number of days.
function PeriodPlanner({ recipes, activePlan }: Pick<Props, "recipes" | "activePlan">) {
  const { refresh } = useShell();
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) {
      toast.warning("Selecciona al menos una receta");
      return;
    }
    const form = event.currentTarget;
    const trainingDays = Number((form.elements.namedItem("training_days") as HTMLInputElement).value || 0);
    const includeAddOns = (form.elements.namedItem("include_add_ons") as HTMLInputElement).checked;
    setBusy(true);
    try {
      // One recipe repeats for the whole period; several rotate, so each covers its share of the days.
      for (const recipeId of selected) {
        await api("/api/cart/items", {
          method: "POST",
          body: JSON.stringify({ source_type: "recipe", source_id: recipeId, period_days: Math.ceil(days / selected.length), training_days: trainingDays, include_add_ons: includeAddOns })
        });
      }
      toast.success("Recetas agregadas al carrito", { description: `${selected.length} ${selected.length === 1 ? "receta" : "recetas"} para ${days} días` });
      setSelected([]);
      refresh();
    } catch (err) {
      toast.error("No se pudo planificar el periodo", { description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="order-card planner" onSubmit={submit}>
      <header className="order-head">
        <div>
          <h2><CalendarDays size={20} /> Planificar periodo</h2>
          <p>{activePlan ? `Del plan ${activePlan}. ` : ""}Elige recetas y días; las cantidades se suman en el carrito.</p>
        </div>
      </header>
      <div className="planner-row">
        <div className="order-chips" role="group" aria-label="Días">
          {PERIODS.map((value) => (
            <button key={value} type="button" className={days === value ? "order-chip on" : "order-chip"} aria-pressed={days === value} onClick={() => setDays(value)}>
              {value === 14 ? "1 quincena" : `${value} días`}
            </button>
          ))}
          <label className="planner-field">Días<input type="number" min={1} max={60} value={days} onChange={(event) => setDays(Math.max(1, Number(event.target.value) || 1))} /></label>
          <label className="planner-field">Entrenamiento<input name="training_days" type="number" min={0} defaultValue={0} /></label>
        </div>
      </div>
      <div className="planner-recipes" role="group" aria-label="Recetas">
        {recipes.map((recipe) => {
          const on = selected.includes(recipe.id);
          return (
            <button key={recipe.id} type="button" className={on ? "planner-recipe on" : "planner-recipe"} aria-pressed={on} onClick={() => toggle(recipe.id)}>
              {on && <Check size={14} />}{recipe.name}
            </button>
          );
        })}
      </div>
      <footer className="planner-foot">
        <label className="check"><input name="include_add_ons" type="checkbox" defaultChecked /> Incluir complementos obligatorios</label>
        <button type="submit" className="order-cta" disabled={busy || !selected.length}>
          Agregar {selected.length ? `${selected.length} ${selected.length === 1 ? "receta" : "recetas"}` : "recetas"} al carrito
        </button>
      </footer>
    </form>
  );
}
