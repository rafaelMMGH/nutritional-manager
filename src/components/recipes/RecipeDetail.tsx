"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { Archive, ArrowLeft, Check, ChefHat, CircleCheck, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { ViewTransition } from "@/components/shared/ViewTransition";
import { foodGroup, foodIcon, isReadableName, normalize, plural, qty } from "@/components/dashboard/food";
import { useAssistantContext } from "@/components/app/assistant";
import { recipeMeta } from "./recipe-meta";
import { RecipeEditDialog } from "./RecipeEditDialog";
import { useRecipeActions } from "./useRecipeActions";
import { useAddState } from "./useAddState";
import "./recipes.css";

type Props = { recipe: any };

// The plan's preparation note, one sentence per step; PDFs without a note only carry "Extraído de …".
function steps(description = "") {
  const text = description.trim();
  if (!text || /^extraido de/.test(normalize(text))) return [];
  return text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿])/).map((step) => step.trim()).filter((step) => step.length > 2);
}

const order = (index: number) => ({ "--i": index }) as CSSProperties;

export function RecipeDetail({ recipe }: Props) {
  const meta = useMemo(() => recipeMeta(recipe), [recipe]);
  const actions = useRecipeActions();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addAll, runAddAll] = useAddState(() => actions.addRecipe(recipe));
  const ingredients: any[] = recipe.ingredients ?? [];
  const preparation = steps(recipe.description);
  const groupCounts = meta.groups.map((group) => ({ ...group, count: ingredients.filter((item) => foodGroup(item.category)?.key === group.key).length }));
  const plans = [...new Set((recipe.appearances ?? []).map((a: any) => a.plan_name).filter(Boolean))] as string[];
  const protein = ingredients.find((item) => foodGroup(item.category)?.key === "proteinas" && isReadableName(item.name));

  useAssistantContext({
    subtitle: `Sobre ${recipe.name}`,
    suggestions: ["¿Qué ingredientes lleva?", "¿Cómo se prepara?", ...(protein ? [`¿Cuánto ${protein.name.toLowerCase()} lleva?`] : []), "¿Qué tengo en mi carrito?"],
    ask: (message) => actions.ask(message, recipe.id)
  });

  async function remove() {
    setBusy(true);
    try {
      await actions.deleteRecipe(recipe, { redirectTo: "/recipes" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rx-detail">
      <Link href="/recipes" prefetch className="rx-back rx-rise">
        <ArrowLeft size={16} /> Recetario
      </Link>

      <div className="rx-detail-grid">
        <aside className="rx-summary rx-rise" style={order(1)}>
          <ViewTransition name={`recipe-image-${recipe.id}`} share="morph" default="none">
            <div className={`rx-media rx-detail-media tone-${meta.tone}`}>
              <img src={meta.icon} alt="" className="rx-dish" />
              {meta.extras.map((icon, index) => (
                <img key={icon} src={icon} alt="" className={`rx-float f${index}`} />
              ))}
            </div>
          </ViewTransition>
          <div className="rx-summary-body">
            <ViewTransition name={`recipe-title-${recipe.id}`} share="text-morph" default="none">
              <h1>{recipe.name}</h1>
            </ViewTransition>
            <p className="rx-meta">
              <span className={`rx-tag tone-${meta.tone}`}>{meta.category.label}</span>
              {meta.active ? (
                <span className="rx-status is-active">
                  <CircleCheck size={14} /> En tu plan activo
                </span>
              ) : (
                <span className="rx-status">
                  <Archive size={14} /> De un plan anterior
                </span>
              )}
            </p>
            {groupCounts.length > 0 && (
              <ul className="rx-group-list" aria-label="Ingredientes por grupo">
                {groupCounts.map((group) => (
                  <li key={group.key}>
                    <i style={{ background: group.color }} /> <b>{group.count}</b> {group.label}
                  </li>
                ))}
              </ul>
            )}
            {plans.length > 0 && <p className="rx-source">De tu plan: {plans.join(", ")}</p>}
            <button type="button" className="rx-btn rx-add-all" data-state={addAll} disabled={addAll !== "idle"} onClick={runAddAll}>
              {addAll === "added" ? (
                <>
                  <Check size={18} strokeWidth={2.5} /> Agregada al carrito
                </>
              ) : addAll === "busy" ? (
                "Agregando…"
              ) : (
                <>
                  <ShoppingCart size={18} /> Agregar {plural(ingredients.length, "ingrediente", "ingredientes")} al carrito
                </>
              )}
            </button>
            <div className="rx-quiet-actions">
              <button type="button" className="rx-text-btn" disabled={busy} onClick={() => setEditing(true)}>
                <Pencil size={15} /> Editar
              </button>
              <button type="button" className="rx-text-btn is-danger" disabled={busy} onClick={() => void remove()}>
                <Trash2 size={15} /> Enviar a papelera
              </button>
            </div>
          </div>
        </aside>

        <div className="rx-detail-main">
          <section className="rx-panel rx-rise" style={order(2)} aria-labelledby="rx-ingredients-title">
            <header className="rx-panel-head">
              <h2 id="rx-ingredients-title">Ingredientes</h2>
              <span className="rx-count">{ingredients.length}</span>
            </header>
            <ul className="rx-ingredients">
              {ingredients.map((item, index) => (
                <IngredientRow key={`${item.name}-${index}`} item={item} index={index} onAdd={() => actions.addIngredient(item)} />
              ))}
            </ul>
          </section>

          <section className="rx-panel rx-rise" style={order(3)} aria-labelledby="rx-steps-title">
            <header className="rx-panel-head">
              <h2 id="rx-steps-title">
                <ChefHat size={20} /> Preparación
              </h2>
              {preparation.length > 0 && <span className="rx-count">{plural(preparation.length, "paso", "pasos")}</span>}
            </header>
            {preparation.length ? (
              <ol className="rx-steps">
                {preparation.map((step, index) => (
                  <li key={index}>
                    <span className="rx-step-num">{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rx-steps-empty">
                <p>Tu plan no incluye instrucciones para esta receta. Puedes escribirlas tú o preguntarle al asistente por sus ingredientes.</p>
                <button type="button" className="rx-btn is-quiet" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Escribir los pasos
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
      <RecipeEditDialog recipe={recipe} open={editing} onOpenChange={setEditing} onSave={(changes) => actions.updateRecipe(recipe, changes)} />
    </div>
  );
}

function IngredientRow({ item, index, onAdd }: { item: any; index: number; onAdd: () => Promise<boolean> }) {
  const [state, add] = useAddState(onAdd);
  const readable = isReadableName(item.name);
  const name = readable ? item.name.trim() : "Ingrediente por revisar";
  const amount = `${qty(item.quantity)} ${item.unit}`.trim();
  return (
    <li style={order(index)}>
      <img src={foodIcon(item.name, item.category)} alt="" width={36} height={36} loading="lazy" />
      <span className={readable ? "rx-ing-name" : "rx-ing-name is-unreadable"} title={readable ? undefined : "El nombre no se pudo leer del PDF"}>
        {name}
      </span>
      <span className="rx-ing-amount">{amount}</span>
      <button
        type="button"
        className="rx-ing-add"
        data-state={state}
        disabled={state !== "idle"}
        title={state === "added" ? "Agregado" : "Agregar al carrito"}
        aria-label={state === "added" ? `${name} agregado al carrito` : `Agregar ${amount} de ${name} al carrito`}
        onClick={add}
      >
        {state === "added" ? <Check size={16} strokeWidth={2.5} /> : <Plus size={16} strokeWidth={2.5} />}
      </button>
    </li>
  );
}
