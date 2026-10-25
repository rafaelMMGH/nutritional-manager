import type { AppDb } from "@/lib/types";
import { activePlan } from "@/lib/domain/plans";
import { categoryFor, ensureIngredientUsage, formatQty, id, ingredientKey, now } from "@/lib/domain/nutrition";

const multiplierOf = (item: AppDb["cartItems"][number]) => Number(item.quantity_multiplier || item.period_days || 1);

// Required complements ("Acompañar tus desayunos con…") count once per meal. The options of a meal are alternatives,
// so each meal's add-ons are scaled by the largest multiplier among its live recipe items in the active plan.
function addOnEntries(db: AppDb, userId: string, items: AppDb["cartItems"]) {
  const version = activePlan(db, userId)?.current_version;
  if (!version) return [];
  const mealMultiplier = new Map<string, number>();
  for (const item of items) {
    if (item.source_type !== "recipe" || !item.include_add_ons) continue;
    const recipe = db.recipes.find((entry) => entry.id === item.source_id);
    if (!recipe || recipe.deleted_at) continue;
    for (const link of db.planVersionRecipes) {
      if (link.recipe_id !== item.source_id || link.plan_version_id !== version.id || link.deleted_at) continue;
      const mealId = link.meal_type_id as string;
      mealMultiplier.set(mealId, Math.max(mealMultiplier.get(mealId) ?? 0, multiplierOf(item)));
    }
  }
  const entries: { usage: AppDb["ingredientUsages"][number]; name: string; multiplier: number }[] = [];
  for (const addOn of db.sharedAddOns) {
    const multiplier = mealMultiplier.get(addOn.meal_type_id as string);
    if (!multiplier || addOn.required === false || addOn.deleted_at) continue;
    for (const usage of db.ingredientUsages) {
      if (usage.source_type === "add_on" && usage.source_id === addOn.id && !usage.deleted_at) entries.push({ usage, name: addOn.name as string, multiplier });
    }
  }
  return entries;
}

export function consolidateCart(db: AppDb, userId: string) {
  const cart = db.carts.find((item) => item.user_id === userId && item.status === "active" && !item.deleted_at);
  const items = db.cartItems.filter((item) => item.cart_id === cart?.id && !item.deleted_at);
  const bucket = new Map<string, { name: string; category: string; unit: string; quantity: number; sources: unknown[] }>();
  const sources = [];
  const add = (usage: AppDb["ingredientUsages"][number], sourceName: string, multiplier: number, fallbackName?: string | null) => {
    const ingredient = db.ingredients.find((entry) => entry.id === usage.ingredient_id);
    const name = ingredient?.canonical_name || usage.name_snapshot || fallbackName || "Ingrediente";
    const category = ingredient?.category || usage.category_snapshot || categoryFor(name);
    const unit = usage.practical_unit || usage.unit || "";
    const quantity = Number(usage.practical_quantity || usage.quantity || 1) * multiplier;
    const key = `${ingredientKey(name)}|${unit}`;
    const current = bucket.get(key) || { name, category, unit, quantity: 0, sources: [] };
    current.quantity += quantity;
    current.sources.push({ source_name: sourceName, quantity, unit });
    bucket.set(key, current);
  };
  for (const item of items) {
    let usages: AppDb["ingredientUsages"] = [];
    let sourceName: string = item.source_type;
    if (item.source_type === "recipe") {
      const recipe = db.recipes.find((entry) => entry.id === item.source_id);
      // Read-time filter: the item stays, so restoring the recipe from the Papelera counts it again.
      if (!recipe || recipe.deleted_at) continue;
      sourceName = recipe.name || sourceName;
      usages = db.ingredientUsages.filter((usage) => usage.source_type === "recipe" && usage.source_id === item.source_id && !usage.deleted_at);
    } else if (item.source_type === "manual") {
      usages = [{ ingredient_id: item.manual_ingredient_id || null, quantity: item.manual_quantity || 1, unit: item.manual_unit || "", source_type: "manual", source_id: item.id } as AppDb["ingredientUsages"][number]];
      sourceName = item.manual_name || sourceName;
    } else if (item.source_type === "shopping_list") {
      const listItems = db.shoppingListItems.filter((entry) => entry.shopping_list_id === item.source_id && !entry.deleted_at);
      usages = listItems.map((entry) => ({ ingredient_id: entry.ingredient_id, quantity: entry.quantity_snapshot, unit: entry.unit_snapshot, source_type: "shopping_list", source_id: item.source_id || "", name_snapshot: entry.name_snapshot, category_snapshot: entry.category_snapshot } as AppDb["ingredientUsages"][number]));
      sourceName = db.shoppingLists.find((entry) => entry.id === item.source_id)?.name || sourceName;
    }
    sources.push({ ...item, source_name: sourceName });
    for (const usage of usages) add(usage, sourceName, multiplierOf(item), item.manual_name);
  }
  for (const entry of addOnEntries(db, userId, items)) add(entry.usage, entry.name, entry.multiplier);
  return { cart, sources, ingredients: Array.from(bucket.values()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) };
}

export function addCartItem(db: AppDb, userId: string, body: Record<string, any>) {
  const cart = db.carts.find((item) => item.user_id === userId && item.status === "active" && !item.deleted_at);
  if (!cart) throw new Error("Active cart not found");
  let manualIngredientId: string | null = null;
  if (body.source_type === "manual") {
    const usage = ensureIngredientUsage(db, userId, { name: body.name, quantity: body.quantity, unit: body.unit, category: body.category || categoryFor(body.name) }, "manual", "pending");
    manualIngredientId = usage.ingredient_id;
    usage.deleted_at = now();
  }
  const item = {
    id: id(),
    cart_id: cart.id,
    source_type: body.source_type,
    source_id: body.source_id || null,
    quantity_multiplier: Number(body.quantity_multiplier || body.period_days || 1),
    period_days: Number(body.period_days || 0),
    training_days: Number(body.training_days || 0),
    selected_alternatives: body.selected_alternatives || {},
    include_add_ons: body.include_add_ons ?? true,
    include_supplements: body.include_supplements ?? false,
    manual_name: body.name || null,
    manual_quantity: Number(body.quantity || 1),
    manual_unit: body.unit || "",
    manual_ingredient_id: manualIngredientId,
    created_at: now(),
    updated_at: now(),
    deleted_at: null
  } as AppDb["cartItems"][number];
  db.cartItems.push(item);
  return item;
}

export function generateShoppingList(db: AppDb, userId: string, body: { name?: string; period_days?: number }) {
  const cartData = consolidateCart(db, userId);
  if (!cartData.cart) throw new Error("Active cart not found");
  const plan = activePlan(db, userId);
  const list = {
    id: id(),
    user_id: userId,
    name: body.name || `Lista ${new Date().toLocaleDateString("es-MX")}`,
    plan_version_id: plan?.current_version?.id || null,
    period_days: Number(body.period_days || 0),
    generated_from_cart_id: cartData.cart.id,
    snapshot_data: { sources: cartData.sources, generated_at: now() },
    created_at: now(),
    updated_at: now(),
    deleted_at: null
  };
  db.shoppingLists.push(list);
  cartData.ingredients.forEach((ingredient) => {
    const canonical = db.ingredients.find((item) => ingredientKey(item.canonical_name) === ingredientKey(ingredient.name) && item.user_id === userId);
    db.shoppingListItems.push({
      id: id(),
      shopping_list_id: list.id,
      ingredient_id: canonical?.id || null,
      name_snapshot: ingredient.name,
      quantity_snapshot: ingredient.quantity,
      unit_snapshot: ingredient.unit,
      category_snapshot: ingredient.category,
      status: "Pendiente",
      substitution_data: null,
      source_breakdown: ingredient.sources,
      created_at: now(),
      updated_at: now(),
      deleted_at: null
    });
  });
  return { list, items: db.shoppingListItems.filter((item) => item.shopping_list_id === list.id) };
}

export function exportList(db: AppDb, list: AppDb["shoppingLists"][number], format: string) {
  const items = db.shoppingListItems.filter((item) => item.shopping_list_id === list.id && !item.deleted_at);
  if (format === "json") return JSON.stringify({ ...list, items }, null, 2);
  if (format === "markdown") {
    return [`# ${list.name}`, "", ...items.map((item) => `- [${item.status === "Comprado" ? "x" : " "}] ${item.name_snapshot}: ${formatQty(item.quantity_snapshot)} ${item.unit_snapshot} (${item.category_snapshot})`)].join("\n");
  }
  return [`${list.name}`, ...items.map((item) => `${item.status} - ${item.name_snapshot}: ${formatQty(item.quantity_snapshot)} ${item.unit_snapshot}`)].join("\n");
}
