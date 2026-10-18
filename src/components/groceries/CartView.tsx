"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, CalendarDays, Copy, ListChecks, RotateCcw, X } from "lucide-react";
import { useShell } from "@/components/app/AppShell";
import { confirmDialog } from "@/components/app/feedback";
import { foodIcon, isReadableName, plural, qty } from "@/components/dashboard/food";
import { api, getErrorMessage } from "@/lib/client/api";
import { ManualAddForm, type KnownIngredient } from "./ManualAddForm";
import { SaveTemplateDialog } from "./SaveTemplateDialog";

type Ingredient = { name: string; category: string; unit: string; quantity: number; sources: unknown[] };
type Source = { id: string; source_type: string; source_name: string; period_days?: number | null; manual_quantity?: number | null; manual_unit?: string | null };
type Props = { ingredients: Ingredient[]; sources: Source[]; known: KnownIngredient[] };

const SOURCE_LABEL: Record<string, string> = { recipe: "Receta", manual: "Manual", shopping_list: "Plantilla" };

export function CartView({ ingredients, sources, known }: Props) {
  const { refresh } = useShell();
  const [saving, setSaving] = useState(false);
  const plannedDays = sources.reduce((sum, item) => sum + Number(item.period_days || 0), 0);
  const recipeCount = sources.filter((item) => item.source_type === "recipe").length;

  async function remove(source: Source) {
    try {
      await api(`/api/cart/items/${source.id}`, { method: "DELETE" });
      toast.success("Quitado del carrito", { description: source.source_name });
      refresh();
    } catch (err) {
      toast.error("No se pudo quitar", { description: getErrorMessage(err) });
    }
  }

  async function clear() {
    if (!(await confirmDialog("Vaciar carrito", "Se quitarán todos los ingredientes del carrito.", "Vaciar"))) return;
    try {
      await api("/api/cart/clear", { method: "POST", body: "{}" });
      toast.success("Carrito vaciado");
      refresh();
    } catch (err) {
      toast.error("No se pudo vaciar el carrito", { description: getErrorMessage(err) });
    }
  }

  async function copy() {
    const text = ingredients.map((item) => `- ${item.name}: ${qty(item.quantity)} ${item.unit}`.trim()).join("\n");
    try {
      await navigator.clipboard.writeText(`Lista de compras\n${text}`);
      toast.success("Lista copiada");
    } catch {
      toast.error("No se pudo copiar la lista");
    }
  }

  const empty = ingredients.length === 0;

  return (
    <div className="groceries-stack">
      <section className="order-card">
        <header className="order-head">
          <div>
            <h1>Carrito</h1>
            <p>{new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div className="order-actions">
            <button type="button" className="round-btn" title="Copiar lista" aria-label="Copiar lista" disabled={empty} onClick={copy}><Copy size={18} /></button>
            <button type="button" className="round-btn" title="Guardar como plantilla" aria-label="Guardar como plantilla" disabled={empty} onClick={() => setSaving(true)}><BookmarkPlus size={18} /></button>
            <button type="button" className="round-btn danger" title="Vaciar carrito" aria-label="Vaciar carrito" disabled={empty} onClick={clear}><RotateCcw size={18} /></button>
          </div>
        </header>
        {empty ? (
          <div className="empty">Tu carrito está vacío. Agrega ingredientes, planifica un periodo o carga una plantilla.</div>
        ) : (
          <ul className="order-list">
            {ingredients.map((item) => {
              const readable = isReadableName(item.name);
              const from = [...new Set((item.sources as { source_name: string }[]).map((source) => source.source_name))];
              return (
                <li key={`${item.name}:${item.unit}`} className="order-row">
                  <span className="order-thumb"><img src={foodIcon(item.name, item.category)} alt="" width={36} height={36} loading="lazy" /></span>
                  <div className="order-info">
                    <strong className={readable ? "" : "unreadable"}>{readable ? item.name : "Ingrediente por revisar"}</strong>
                    <p>{item.category} · De {from.slice(0, 2).join(", ")}{from.length > 2 ? ` y ${from.length - 2} más` : ""}</p>
                  </div>
                  <span className="order-qty strong">{qty(item.quantity)} {item.unit}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="order-total">
          <span>Total:</span>
          <strong>{plural(ingredients.length, "ingrediente", "ingredientes")}</strong>
        </div>
        <div className="order-stats">
          <div className="order-stat blue"><CalendarDays size={20} /><span>Días planificados</span><strong>{plannedDays}</strong></div>
          <div className="order-stat coral"><ListChecks size={20} /><span>Recetas</span><strong>{recipeCount}</strong></div>
        </div>
      </section>

      <section className="order-card">
        <header className="order-head">
          <div>
            <h2>Agregado desde</h2>
            <p>Quita una receta, plantilla o ingrediente y el total se recalcula.</p>
          </div>
        </header>
        {sources.length > 0 && (
          <ul className="source-list">
            {sources.map((source) => (
              <li key={source.id}>
                <span className="source-type">{SOURCE_LABEL[source.source_type] ?? source.source_type}</span>
                <strong>{source.source_name}</strong>
                <small>{source.source_type === "manual" ? `${qty(Number(source.manual_quantity || 1))} ${source.manual_unit || ""}` : source.period_days ? plural(Number(source.period_days), "día", "días") : ""}</small>
                <button type="button" title="Quitar" aria-label={`Quitar ${source.source_name}`} onClick={() => remove(source)}><X size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        <ManualAddForm known={known} />
      </section>
      <SaveTemplateDialog open={saving} onOpenChange={setSaving} />
    </div>
  );
}
