"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, ClipboardList, Trash2 } from "lucide-react";
import { useShell } from "@/components/app/AppShell";
import { confirmDialog } from "@/components/app/feedback";
import { plural } from "@/components/dashboard/food";
import { api, getErrorMessage } from "@/lib/client/api";
import { SaveTemplateDialog } from "./SaveTemplateDialog";

type Template = { id: string; name: string; description: string; created_at: string; itemCount: number };

export function TemplatesView({ templates, cartCount }: { templates: Template[]; cartCount: number }) {
  const { refresh } = useShell();
  const [saving, setSaving] = useState(false);

  async function load(template: Template, mode: "replace" | "append") {
    if (mode === "replace" && cartCount > 0 && !(await confirmDialog("Reemplazar carrito", "El carrito actual se reemplazará con esta plantilla.", "Reemplazar"))) return;
    try {
      await api(`/api/templates/${template.id}/load-to-cart`, { method: "POST", body: JSON.stringify({ mode }) });
      toast.success(mode === "replace" ? "Carrito reemplazado" : "Plantilla agregada al carrito", { description: template.name });
      refresh();
    } catch (err) {
      toast.error("No se pudo cargar la plantilla", { description: getErrorMessage(err) });
    }
  }

  async function remove(template: Template) {
    if (!(await confirmDialog("Enviar plantilla a papelera", `"${template.name}" quedará disponible para restaurar.`, "Eliminar"))) return;
    try {
      await api(`/api/templates/${template.id}`, { method: "DELETE" });
      toast.success("Plantilla enviada a papelera");
      refresh();
    } catch (err) {
      toast.error("No se pudo eliminar", { description: getErrorMessage(err) });
    }
  }

  return (
    <div className="groceries-stack">
      <section className="order-card">
        <header className="order-head">
          <div>
            <h1>Plantillas</h1>
            <p>Tus listas frecuentes. Cárgalas al carrito en un clic.</p>
          </div>
          <div className="order-actions">
            <button type="button" className="order-cta small" disabled={!cartCount} title={cartCount ? undefined : "Tu carrito está vacío"} onClick={() => setSaving(true)}>
              <BookmarkPlus size={16} /> Guardar carrito
            </button>
          </div>
        </header>
        {templates.length ? (
          <ul className="order-list">
            {templates.map((template) => (
              <li key={template.id} className="order-row template-row">
                <span className="order-thumb"><ClipboardList size={22} /></span>
                <div className="order-info">
                  <strong>{template.name}</strong>
                  <p>{template.description || plural(template.itemCount, "ingrediente", "ingredientes")} · {new Date(template.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <div className="template-actions">
                  <button type="button" className="pill-btn" onClick={() => load(template, "replace")}>Cargar</button>
                  <button type="button" className="pill-btn" onClick={() => load(template, "append")}>Agregar</button>
                  <button type="button" className="round-btn danger small" title="Eliminar" aria-label={`Eliminar ${template.name}`} onClick={() => remove(template)}><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">Aún no tienes plantillas. Arma tu carrito y guárdalo para reutilizarlo.</div>
        )}
      </section>
      <SaveTemplateDialog open={saving} onOpenChange={setSaving} />
    </div>
  );
}
