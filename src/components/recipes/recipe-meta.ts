import { foodGroup, foodIcon, mealLabel, normalize } from "@/components/dashboard/food";

// Fixed "Tipo de comida" buckets for the Recetario sidebar, in display order.
export const MEAL_CATEGORIES = [
  { key: "breakfast", label: "Desayuno" },
  { key: "lunch", label: "Comida" },
  { key: "dinner", label: "Cena" },
  { key: "snacks", label: "Snacks" },
  { key: "desserts", label: "Postres" },
  { key: "drinks", label: "Bebidas" },
  { key: "others", label: "Otros" }
] as const;

export type MealCategory = (typeof MEAL_CATEGORIES)[number]["key"];

const DRINK = /\b(licuado|smoothie|jugo|agua|cafe|te|batido|malteada|bebida|shake)\b/;
const DESSERT = /\b(postre|gelatina|pastel|pay|helado|flan|galleta|brownie|pudin|mousse|nieve|hot cake|hotcake)s?\b/;
const BY_MEAL_TYPE: Record<string, MealCategory> = { desayuno: "breakfast", comida: "lunch", almuerzo: "lunch", cena: "dinner", colacion: "snacks", snack: "snacks" };

// Drinks and desserts are recognized by the dish name; everything else follows the plan's meal type.
function mealCategory(name: string, mealTypes: string[]): MealCategory {
  const key = normalize(name);
  if (DRINK.test(key)) return "drinks";
  if (DESSERT.test(key)) return "desserts";
  return mealTypes.map((type) => BY_MEAL_TYPE[type]).find(Boolean) ?? "others";
}

const GARNISH = new Set(["/food/plate.png", "/food/salt.png", "/food/olive.png", "/food/droplet.png", "/food/garlic.png", "/food/onion.png"]);

const CATEGORY_TONES: Record<MealCategory, string> = { breakfast: "coral", lunch: "orange", dinner: "blue", snacks: "green", desserts: "coral", drinks: "teal", others: "blue" };

// Everything the recipe card and filters derive from a recipe returned by /api/recipes.
export function recipeMeta(recipe: any) {
  const ingredients: any[] = recipe.ingredients ?? [];
  const icons = ingredients.map((item) => foodIcon(item.name, item.category)).filter((icon) => !GARNISH.has(icon));
  const named = foodIcon(recipe.name);
  const icon = named !== "/food/plate.png" ? named : icons[0] ?? "/food/plate.png";
  const meals = [...new Map((recipe.appearances ?? []).filter((a: any) => a.meal_type).map((a: any) => [normalize(a.meal_type), mealLabel(a.meal_type)])).entries()]
    .map(([key, label]) => ({ key: key as string, label: label as string }));
  const groups = [...new Map(ingredients.map((item) => foodGroup(item.category)).filter(Boolean).map((group) => [group!.key, group!])).values()];
  const category = mealCategory(recipe.name, meals.map((meal) => meal.key));
  return {
    icon,
    category: MEAL_CATEGORIES.find((item) => item.key === category)!,
    extras: [...new Set(icons.filter((item) => item !== icon))].slice(0, 2),
    meals,
    tone: CATEGORY_TONES[category],
    groups,
    active: (recipe.appearances ?? []).some((a: any) => a.plan_status === "active"),
    ingredientCount: ingredients.length
  };
}

export type RecipeMeta = ReturnType<typeof recipeMeta>;
