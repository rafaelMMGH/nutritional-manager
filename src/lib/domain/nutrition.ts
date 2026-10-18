import { createHash, randomUUID } from "node:crypto";
import type { AppDb, IngredientUsage, StructuredIngredient, StructuredRecipe } from "@/lib/types";

export const now = () => new Date().toISOString();
export const id = () => randomUUID();

// Ordered: the first matching term wins, so specific phrases come before generic words.
const categories: [string, string][] = [
  ["proteina", "Suplementos"],
  ["creatina", "Suplementos"],
  ["agua", "Bebidas"],
  ["cafe", "Bebidas"],
  ["te", "Bebidas"],
  ["jugo", "Bebidas"],
  ["leche", "Lacteos"],
  ["yogurt", "Lacteos"],
  ["yogur", "Lacteos"],
  ["yakult", "Lacteos"],
  ["queso", "Lacteos"],
  ["requeson", "Lacteos"],
  ["pollo", "Proteinas"],
  ["pavo", "Proteinas"],
  ["jamon", "Proteinas"],
  ["salchicha", "Proteinas"],
  ["huevo", "Proteinas"],
  ["clara", "Proteinas"],
  ["atun", "Proteinas"],
  ["salmon", "Proteinas"],
  ["pescado", "Proteinas"],
  ["tilapia", "Proteinas"],
  ["camaron", "Proteinas"],
  ["carne", "Proteinas"],
  ["res", "Proteinas"],
  ["bistec", "Proteinas"],
  ["molida", "Proteinas"],
  ["chuleta", "Proteinas"],
  ["cerdo", "Proteinas"],
  ["lomo", "Proteinas"],
  ["frijol", "Leguminosas"],
  ["lenteja", "Leguminosas"],
  ["garbanzo", "Leguminosas"],
  ["arroz", "Cereales / tortillas / pan"],
  ["tortilla", "Cereales / tortillas / pan"],
  ["tostada", "Cereales / tortillas / pan"],
  ["pan", "Cereales / tortillas / pan"],
  ["bolillo", "Cereales / tortillas / pan"],
  ["telera", "Cereales / tortillas / pan"],
  ["galleta", "Cereales / tortillas / pan"],
  ["avena", "Cereales / tortillas / pan"],
  ["granola", "Cereales / tortillas / pan"],
  ["pasta", "Cereales / tortillas / pan"],
  ["papa", "Cereales / tortillas / pan"],
  ["elote", "Cereales / tortillas / pan"],
  ["maiz", "Cereales / tortillas / pan"],
  ["aceite", "Grasas"],
  ["aguacate", "Grasas"],
  ["mayonesa", "Grasas"],
  ["crema", "Grasas"],
  ["mantequilla", "Grasas"],
  ["nuez", "Grasas"],
  ["nueces", "Grasas"],
  ["almendra", "Grasas"],
  ["cacahuate", "Grasas"],
  ["azucar", "Azucares"],
  ["miel", "Azucares"],
  ["catsup", "Condimentos"],
  ["salsa", "Condimentos"],
  ["sal", "Condimentos"],
  ["pimienta", "Condimentos"],
  ["ajo", "Condimentos"],
  ["platano", "Frutas"],
  ["guineo", "Frutas"],
  ["manzana", "Frutas"],
  ["mango", "Frutas"],
  ["papaya", "Frutas"],
  ["pina", "Frutas"],
  ["fresa", "Frutas"],
  ["berries", "Frutas"],
  ["naranja", "Frutas"],
  ["mandarina", "Frutas"],
  ["uva", "Frutas"],
  ["melon", "Frutas"],
  ["sandia", "Frutas"],
  ["pera", "Frutas"],
  ["kiwi", "Frutas"],
  ["limon", "Frutas"],
  ["verdura", "Verduras"],
  ["lechuga", "Verduras"],
  ["tomate", "Verduras"],
  ["jitomate", "Verduras"],
  ["cebolla", "Verduras"],
  ["cilantro", "Verduras"],
  ["chile", "Verduras"],
  ["zanahoria", "Verduras"],
  ["betabel", "Verduras"],
  ["nopal", "Verduras"],
  ["chayote", "Verduras"],
  ["calabaza", "Verduras"],
  ["calabacita", "Verduras"],
  ["espinaca", "Verduras"],
  ["pepino", "Verduras"],
  ["jicama", "Verduras"],
  ["rabano", "Verduras"],
  ["brocoli", "Verduras"]
];

export function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Matching key for ingredient names: accent-free, lowercase, simple Spanish plurals folded
// so "huevos" and "huevo" (or "galletas maría" and "galleta maría") share one catalog entry.
export function ingredientKey(name = "") {
  return normalize(name)
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 3) return word;
      if (word.endsWith("ces")) return `${word.slice(0, -3)}z`;
      const stem = word.endsWith("s") ? word.slice(0, -1) : word;
      // nopal/nopales, chile/chiles, limón/limones: drop the "e" both forms may end with.
      return /[lnrd]e$/.test(stem) && stem.length > 3 ? stem.slice(0, -1) : stem;
    })
    .join(" ");
}

export function categoryFor(name: string) {
  const key = normalize(name);
  // Match whole words (allowing plurals) so "fresas" is not read as "res".
  const hit = categories.find(([term]) => new RegExp(`\\b${term}(s|es)?\\b`).test(key));
  return hit ? hit[1] : "Otros";
}

export function canonicalHash(recipe: Pick<StructuredRecipe, "ingredients">) {
  const parts = recipe.ingredients
    .map((item) => `${normalize(item.name)}:${item.quantity || ""}:${normalize(item.unit || "")}`)
    .sort()
    .join("|");
  return createHash("sha256").update(parts).digest("hex");
}

export function ensureIngredientUsage(
  db: AppDb,
  userId: string,
  ingredient: StructuredIngredient,
  sourceType: string,
  sourceId: string
): IngredientUsage {
  let canonical = db.ingredients.find(
    (item) => item.user_id === userId && ingredientKey(item.canonical_name) === ingredientKey(ingredient.name) && !item.deleted_at
  );
  if (!canonical) {
    canonical = {
      id: id(),
      user_id: userId,
      canonical_name: ingredient.name,
      category: ingredient.category || categoryFor(ingredient.name),
      primary_unit: ingredient.unit || "",
      created_at: now(),
      updated_at: now(),
      deleted_at: null
    };
    db.ingredients.push(canonical);
  }
  const usage: IngredientUsage = {
    id: id(),
    ingredient_id: canonical.id,
    source_type: sourceType,
    source_id: sourceId,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    practical_quantity: ingredient.practical_quantity || null,
    practical_unit: ingredient.practical_unit || null,
    notes: ingredient.notes || "",
    is_optional: Boolean(ingredient.is_optional),
    alternative_group_id: ingredient.alternative_group_id || null,
    confidence_score: ingredient.confidence_score ?? 0.8,
    requires_review: Boolean(ingredient.requires_review),
    created_at: now(),
    deleted_at: null
  };
  db.ingredientUsages.push(usage);
  return usage;
}

export function formatQty(value: number) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
}
