import type { AppDb } from "@/lib/types";
import { consolidateCart } from "@/lib/domain/cart";
import { activePlan, recipeDetails } from "@/lib/domain/plans";
import { formatQty, normalize } from "@/lib/domain/nutrition";

export function ragAnswer(db: AppDb, userId: string, question: string, scope = "auto", recipeId?: string) {
  const q = normalize(question);
  const context = scope === "auto" ? "Todo el sistema" : scope;
  const sources: string[] = [];
  const snippets: string[] = [];
  const recipe = recipeId ? db.recipes.find((item) => item.id === recipeId && item.user_id === userId && !item.deleted_at) : undefined;
  if (recipe) {
    // Asked from a recipe's page: answer from that recipe first, narrowing to the ingredients the question names.
    const details = recipeDetails(db, recipe);
    const named = details.ingredients.filter((item) => normalize(item.name).split(/\s+/).some((word) => word.length > 2 && q.includes(word)));
    const list = (named.length ? named : details.ingredients).map((item) => `${item.name} ${formatQty(item.quantity)} ${item.unit}`.trim());
    const instructions = recipe.description && !/^extraido de/.test(normalize(recipe.description)) ? recipe.description : "";
    const aboutPreparation = /prepar|como|cocin|paso|hace/.test(q);
    sources.push(`Receta: ${recipe.name}`);
    if (named.length || !aboutPreparation || !instructions) snippets.push(`${named.length ? "En" : "Ingredientes de"} ${recipe.name}: ${list.join("; ")}`);
    if (instructions && (aboutPreparation || !named.length)) snippets.push(`Preparación: ${instructions}`);
  }
  const plan = activePlan(db, userId);
  if (plan?.current_version && (scope === "auto" || scope.includes("Plan") || q.includes("plan"))) {
    const data = plan.current_version.structured_data;
    sources.push(`Plan activo: ${plan.name}`);
    snippets.push(`Objetivo: ${data.objective}`);
    snippets.push(`Comidas: ${data.meals.map((meal) => meal.name).join(", ")}`);
    if (q.includes("suplement")) snippets.push(`Suplementos: ${(data.supplements || []).map((item) => item.name).join(", ") || "sin suplementos encontrados"}`);
    if (q.includes("recomend")) snippets.push(`Recomendaciones: ${data.recommendations}`);
  }
  if (scope === "auto" || scope.includes("Carrito") || q.includes("carrito") || q.includes("compr")) {
    const cart = consolidateCart(db, userId);
    if (cart.ingredients.length) {
      sources.push("Carrito actual");
      snippets.push(`Ingredientes en carrito: ${cart.ingredients.map((item) => `${item.name} ${formatQty(item.quantity)} ${item.unit}`.trim()).join("; ")}`);
    }
  }
  if (scope === "auto" || scope.includes("Recetario") || q.includes("receta")) {
    const recipes = db.recipes.filter((item) => item.user_id === userId && !item.deleted_at);
    const matches = recipes.filter((item) => normalize(item.name).includes(q.split(" ")[0] || ""));
    if (recipes.length) {
      sources.push("Recetario");
      snippets.push(`Recetas disponibles: ${(matches.length ? matches : recipes).slice(0, 8).map((item) => item.name).join(", ")}`);
    }
  }
  if (!snippets.length) {
    return {
      answer: scope === "Plan activo" ? "No encontré esa información en tu plan activo." : "No encontré esa información en el sistema.",
      context_used: context,
      sources: []
    };
  }
  return { answer: snippets.join("\n"), context_used: context, sources };
}
