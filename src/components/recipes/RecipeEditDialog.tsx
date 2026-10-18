"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  recipe: { name: string; description?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (changes: { name: string; description: string }) => Promise<boolean>;
};

// Edits the recipe's name and its preparation note (shown as the steps on the detail page).
export function RecipeEditDialog({ recipe, open, onOpenChange, onSave }: Props) {
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const saved = await onSave({ name: String(form.get("name")).trim(), description: String(form.get("description")).trim() });
    setSaving(false);
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar receta</DialogTitle>
          <DialogDescription>Cambia el nombre o los pasos de preparación.</DialogDescription>
        </DialogHeader>
        <form id="recipe-edit" className="form recipe-edit-form" onSubmit={submit}>
          <label>Nombre<input name="name" defaultValue={recipe.name} required maxLength={200} /></label>
          <label>Preparación<textarea name="description" defaultValue={recipe.description ?? ""} rows={6} maxLength={5000} /></label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="recipe-edit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
