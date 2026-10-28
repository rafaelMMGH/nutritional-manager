"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useShell } from "@/components/app/AppShell";
import { confirmDialog } from "@/components/app/feedback";
import { qty } from "@/components/dashboard/food";
import { api, getErrorMessage } from "@/lib/client/api";

// Recipe mutations go through the API routes, then refresh the server-rendered pages.
export function useRecipeActions() {
  const router = useRouter();
  const { refresh } = useShell();

  /** Adds every ingredient of the recipe to the cart; resolves true when it was added. */
  async function addRecipe(recipe: any) {
    try {
      await api("/api/cart/items", { method: "POST", body: JSON.stringify({ source_type: "recipe", source_id: recipe.id, quantity_multiplier: 1 }) });
      toast.success("Receta agregada al carrito", { description: recipe.name });
      refresh();
      return true;
    } catch (err) {
      toast.error("No se pudo agregar", { description: getErrorMessage(err) });
      return false;
    }
  }

  async function addIngredient(item: any) {
    try {
      await api("/api/cart/items", { method: "POST", body: JSON.stringify({ source_type: "manual", name: item.name, quantity: item.quantity || 1, unit: item.unit || "", category: item.category }) });
      toast.success("Ingrediente agregado al carrito", { description: `${qty(item.quantity)} ${item.unit} de ${item.name}` });
      refresh();
      return true;
    } catch (err) {
      toast.error("No se pudo agregar", { description: getErrorMessage(err) });
      return false;
    }
  }

  /** Saves the recipe's name and preparation; resolves true when it was saved. */
  async function updateRecipe(recipe: any, changes: { name: string; description: string }) {
    try {
      await api(`/api/recipes/${recipe.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      toast.success("Receta actualizada", { description: changes.name });
      refresh();
      return true;
    } catch (err) {
      toast.error("No se pudo guardar", { description: getErrorMessage(err) });
      return false;
    }
  }

  /** Sends the recipe to the trash after confirming; resolves true when it was deleted. */
  async function deleteRecipe(recipe: any, { redirectTo }: { redirectTo?: string } = {}) {
    if (!await confirmDialog("Enviar receta a papelera", `"${recipe.name}" quedará disponible para restaurar.`, "Eliminar")) return false;
    try {
      await api(`/api/recipes/${recipe.id}`, { method: "DELETE" });
      toast.success("Receta enviada a papelera");
      if (redirectTo) router.push(redirectTo);
      refresh();
      return true;
    } catch (err) {
      toast.error("No se pudo eliminar", { description: getErrorMessage(err) });
      return false;
    }
  }

  return { addRecipe, addIngredient, updateRecipe, deleteRecipe };
}
