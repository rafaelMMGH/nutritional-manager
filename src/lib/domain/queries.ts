import type { AppDb, AppUser } from "@/lib/types";
import { consolidateCart } from "@/lib/domain/cart";
import { activePlan, activeSchedule, listRecipes } from "@/lib/domain/plans";
import { ingredientKey } from "@/lib/domain/nutrition";
import { cartCollections, loadDb, recipeCollections, union, type Collection } from "@/lib/storage/store";

// Read-only queries shared by the server pages and the GET API routes.

// Collections each query computes over; load them with loadFor before calling it.
export const needs = {
  activePlan: ["plans", "planVersions"],
  cart: cartCollections,
  dashboard: union(cartCollections, recipeCollections, ["mealTypes", "mealOptions", "dailyLogs"]),
  plans: ["plans", "planVersions"],
  recipes: recipeCollections,
  settings: ["ingredients", "ingredientAliases"],
  shoppingLists: ["shoppingLists", "shoppingListItems"],
  templates: ["shoppingTemplates"],
  trash: ["plans", "recipes", "shoppingLists", "shoppingTemplates"]
} satisfies Record<string, Collection[]>;

export function loadFor(user: AppUser, ...queries: (keyof typeof needs)[]) {
  return loadDb(user, union(...queries.map((query) => needs[query])), { settings: queries.includes("settings") });
}

export function listPlans(db: AppDb, userId: string) {
  return db.plans
    .filter((item) => item.user_id === userId && !item.deleted_at)
    .map((plan) => ({ ...plan, current_version: db.planVersions.find((entry) => entry.plan_id === plan.id && entry.is_current && !entry.deleted_at) || null }));
}

export function listShoppingLists(db: AppDb, userId: string) {
  return db.shoppingLists
    .filter((item) => item.user_id === userId && !item.deleted_at)
    .map((list) => ({ ...list, items: db.shoppingListItems.filter((item) => item.shopping_list_id === list.id && !item.deleted_at) }));
}

export function listTemplates(db: AppDb, userId: string) {
  return db.shoppingTemplates.filter((item) => item.user_id === userId && !item.deleted_at);
}

export function listTrash(db: AppDb, userId: string) {
  return [
    ...db.plans.filter((item) => item.user_id === userId && item.deleted_at).map((item) => ({ type: "plan", ...item })),
    ...db.recipes.filter((item) => item.user_id === userId && item.deleted_at).map((item) => ({ type: "recipe", ...item })),
    ...db.shoppingLists.filter((item) => item.user_id === userId && item.deleted_at).map((item) => ({ type: "shopping_list", ...item })),
    ...db.shoppingTemplates.filter((item) => item.user_id === userId && item.deleted_at).map((item) => ({ type: "template", ...item }))
  ];
}

export function getSettings(db: AppDb, userId: string) {
  return {
    ingredients: db.ingredients.filter((item) => item.user_id === userId && !item.deleted_at),
    aliases: db.ingredientAliases,
    settings: db.settings
  };
}

export function dashboardSummary(db: AppDb, userId: string) {
  const cart = consolidateCart(db, userId);
  const lists = db.shoppingLists.filter((item) => item.user_id === userId && !item.deleted_at);
  const recipes = db.recipes.filter((item) => item.user_id === userId && !item.deleted_at);
  return {
    activePlan: activePlan(db, userId),
    cartCount: cart.sources.length,
    cartIngredients: cart.ingredients.length,
    lastList: lists.at(-1) || null,
    listsCount: lists.length,
    recipesCount: recipes.length,
    plannedDays: cart.sources.reduce((sum, item) => sum + Number(item.period_days || 0), 0),
    schedule: activeSchedule(db, userId),
    dailyLogs: db.dailyLogs
      .filter((log) => log.user_id === userId)
      .map(({ date, meals_done, water_glasses, weight_kg, exercised }) => ({ date, meals_done, water_glasses, weight_kg, exercised }))
  };
}

// Every ingredient used by the user's recipes, merged by name, with the recipes it appears in.
// Plan recipes come first so the amounts shown match what the active plan asks for.
export function listGroceries(db: AppDb, userId: string) {
  const recipes = listRecipes(db, userId).sort((a, b) => Number(isActive(b)) - Number(isActive(a)));
  const byName = new Map<string, { name: string; category: string; quantity: number; unit: string; recipes: { id: string; name: string }[] }>();
  for (const recipe of recipes) {
    for (const item of recipe.ingredients) {
      const key = ingredientKey(item.name);
      const entry = byName.get(key) ?? { name: item.name, category: item.category, quantity: Number(item.quantity || 1), unit: item.unit || "", recipes: [] };
      if (!entry.recipes.some((link) => link.id === recipe.id)) entry.recipes.push({ id: recipe.id, name: recipe.name });
      byName.set(key, entry);
    }
  }
  return [...byName.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function isActive(recipe: ReturnType<typeof listRecipes>[number]) {
  return recipe.appearances.some((appearance) => appearance.plan_status === "active");
}
