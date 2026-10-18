import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppDb, Plan, PlanVersion, Recipe, StructuredPlan } from "@/lib/types";
import { storageDir } from "@/lib/storage/db";
import { canonicalHash, ensureIngredientUsage, id, now } from "@/lib/domain/nutrition";
import { extractPlanFromPdf } from "@/lib/domain/pdf-plan";

export function activePlan(db: AppDb, userId: string) {
  const plan = db.plans.find((item) => item.user_id === userId && item.status === "active" && !item.deleted_at);
  if (!plan) return null;
  const version = db.planVersions.find((item) => item.plan_id === plan.id && item.is_current && !item.deleted_at);
  return { ...plan, current_version: version || null };
}

export function activeSchedule(db: AppDb, userId: string) {
  const plan = activePlan(db, userId);
  const version = plan?.current_version;
  if (!plan || !version) return null;
  const meals = db.mealTypes
    .filter((mealType) => mealType.plan_version_id === version.id && !mealType.deleted_at)
    .sort((a, b) => a.display_order - b.display_order)
    .map((mealType) => {
      const options = db.mealOptions
        .filter((option) => option.meal_type_id === mealType.id && !option.deleted_at)
        .sort((a, b) => a.option_number - b.option_number);
      const recipe = options[0] && db.recipes.find((item) => item.id === options[0].recipe_id);
      const details = recipe ? recipeDetails(db, recipe) : null;
      const structuredMeal = version.structured_data.meals[mealType.display_order - 1];
      return {
        id: mealType.id,
        name: mealType.name,
        display_order: mealType.display_order,
        time_window: mealType.time_window,
        options_count: options.length,
        equivalents: structuredMeal?.name === mealType.name ? structuredMeal.equivalents ?? null : null,
        recipe: details && {
          id: details.id,
          name: details.name,
          ingredients: details.ingredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, category: item.category }))
        }
      };
    });
  const water = version.structured_data.nutrition_summary?.water_liters as { min?: number } | undefined;
  return { plan_id: plan.id, plan_name: plan.name, plan_version_id: version.id, water_goal_liters: water?.min ?? null, meals };
}

export function materializePlan(db: AppDb, userId: string, plan: Plan, structuredData: StructuredPlan, pdf: AppDb["uploadedPdfs"][number]) {
  db.plans
    .filter((item) => item.id !== plan.id && item.user_id === userId && item.status === "active" && !item.deleted_at)
    .forEach((item) => {
      item.status = "archived";
      item.updated_at = now();
    });
  const planVersion: PlanVersion = {
    id: id(),
    plan_id: plan.id,
    version_number: 1,
    structured_data: structuredData,
    change_summary: "Version inicial extraida del PDF",
    is_current: true,
    created_at: now(),
    updated_at: now(),
    deleted_at: null
  };
  db.planVersions.push(planVersion);
  db.uploadedPdfs.push(pdf);
  structuredData.meals.forEach((meal, mealIndex) => {
    const mealType = { id: id(), plan_version_id: planVersion.id, name: meal.name, display_order: mealIndex + 1, time_window: meal.time_window || "", created_at: now(), deleted_at: null };
    db.mealTypes.push(mealType);
    meal.options.forEach((option) => {
      const hash = canonicalHash(option.recipe);
      let recipe: Recipe | undefined = db.recipes.find((item) => item.user_id === userId && item.canonical_hash === hash && !item.deleted_at);
      if (!recipe) {
        recipe = {
          id: id(),
          user_id: userId,
          name: option.recipe.name,
          description: option.recipe.description || "",
          canonical_hash: hash,
          created_at: now(),
          updated_at: now(),
          deleted_at: null
        };
        db.recipes.push(recipe);
        option.recipe.ingredients.forEach((ingredient) => ensureIngredientUsage(db, userId, ingredient, "recipe", recipe!.id));
      }
      db.planVersionRecipes.push({ id: id(), plan_version_id: planVersion.id, recipe_id: recipe.id, meal_type_id: mealType.id, option_number: option.option_number, created_at: now(), deleted_at: null });
      db.mealOptions.push({ id: id(), plan_version_id: planVersion.id, meal_type_id: mealType.id, recipe_id: recipe.id, option_number: option.option_number, is_unique_option: meal.options.length === 1, created_at: now(), deleted_at: null });
    });
    meal.add_ons?.forEach((addon) => {
      const addOnId = id();
      db.sharedAddOns.push({ id: addOnId, plan_version_id: planVersion.id, meal_type_id: mealType.id, name: addon.name, required: addon.required, notes: addon.notes || "", applies_to_all_options: true, canonical_hash: canonicalHash({ ingredients: addon.ingredients || [] }), created_at: now(), deleted_at: null });
      (addon.ingredients || []).forEach((ingredient) => ensureIngredientUsage(db, userId, ingredient, "add_on", addOnId));
    });
  });
  db.ragIndexes.push({ id: id(), user_id: userId, scope_type: "plan_version", scope_id: planVersion.id, status: "ready", index_metadata: { chunks: structuredData.meals.length }, created_at: now(), updated_at: now(), deleted_at: null });
  return planVersion;
}

export async function ingestPdfPlan(db: AppDb, userId: string, buffer: Buffer, fileName: string, mimeType = "application/pdf") {
  const pdfId = id();
  const filePath = path.join(storageDir, `${pdfId}-${path.basename(fileName)}`);
  await mkdir(storageDir, { recursive: true });
  await writeFile(filePath, buffer);
  const structured = await extractPlanFromPdf(buffer, fileName, db.settings);
  const plan: Plan = {
    id: id(),
    user_id: userId,
    name: structured.name,
    objective: structured.objective,
    status: "active",
    processing_status: "needs_review",
    created_at: now(),
    updated_at: now(),
    deleted_at: null
  };
  db.plans.push(plan);
  const pdf = { id: pdfId, plan_id: plan.id, file_path: filePath, file_name: fileName, mime_type: mimeType, storage_status: "private", created_at: now(), deleted_at: null };
  const version = materializePlan(db, userId, plan, structured, pdf);
  db.auditEvents.push({ id: id(), user_id: userId, event: "plan_uploaded", entity_id: plan.id, created_at: now() });
  return { plan, version, structured_data: structured };
}

export function recipeDetails(db: AppDb, recipe: Recipe) {
  const usages = db.ingredientUsages.filter((usage) => usage.source_type === "recipe" && usage.source_id === recipe.id && !usage.deleted_at);
  const ingredients = usages.map((usage) => {
    const ingredient = db.ingredients.find((item) => item.id === usage.ingredient_id);
    return { ...usage, name: ingredient?.canonical_name || usage.name_snapshot || "Ingrediente", category: ingredient?.category || "Otros" };
  });
  const appearances = db.planVersionRecipes
    .filter((link) => link.recipe_id === recipe.id && !link.deleted_at)
    .map((link) => {
      const version = db.planVersions.find((item) => item.id === link.plan_version_id);
      const plan = version && db.plans.find((item) => item.id === version.plan_id);
      const meal = db.mealTypes.find((item) => item.id === link.meal_type_id);
      return { plan_id: plan?.id, plan_name: plan?.name, plan_status: plan?.status, version_number: version?.version_number, meal_type: meal?.name, option_number: link.option_number };
    });
  return { ...recipe, ingredients, appearances };
}

// Recipes the user can see in the Recetario, with ingredients and plan appearances.
export function listRecipes(db: AppDb, userId: string) {
  return db.recipes.filter((item) => item.user_id === userId && !item.deleted_at).map((recipe) => recipeDetails(db, recipe));
}

export function findRecipe(db: AppDb, userId: string, recipeId: string) {
  const recipe = db.recipes.find((item) => item.id === recipeId && item.user_id === userId && !item.deleted_at);
  return recipe ? recipeDetails(db, recipe) : null;
}
