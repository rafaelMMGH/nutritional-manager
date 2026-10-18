"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useShell } from "@/components/app/AppShell";
import { api, getErrorMessage } from "@/lib/client/api";

// Names the current cart and saves it as a reusable template.
export function SaveTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { refresh } = useShell();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api("/api/templates", { method: "POST", body: JSON.stringify({ name: String(form.get("name")).trim(), description: String(form.get("description")).trim() }) });
      toast.success("Plantilla guardada");
      onOpenChange(false);
      refresh();
    } catch (err) {
      toast.error("No se pudo guardar la plantilla", { description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar como plantilla</DialogTitle>
          <DialogDescription>Guarda el carrito actual para volver a cargarlo cuando lo necesites.</DialogDescription>
        </DialogHeader>
        <form id="template-save" className="form" onSubmit={submit}>
          <label>Nombre<input name="name" required maxLength={120} defaultValue={`Compra ${new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long" })}`} /></label>
          <label>Descripción<input name="description" maxLength={240} placeholder="Opcional, por ejemplo: semana de entrenamiento" /></label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="template-save" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
