import type { Metadata } from "next";
import { GroceriesView } from "@/components/groceries/GroceriesView";
import { activePlan, listRecipes } from "@/lib/domain/plans";
import { listGroceries, loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Compras · Nutritional Manager" };

export default async function GroceriesPage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "recipes", "activePlan");
  const recipes = listRecipes(db, user.id)
    .map((recipe) => ({ id: recipe.id, name: recipe.name, active: recipe.appearances.some((appearance) => appearance.plan_status === "active") }))
    .sort((a, b) => Number(b.active) - Number(a.active));
  return <GroceriesView groceries={listGroceries(db, user.id)} recipes={recipes} activePlan={activePlan(db, user.id)?.name ?? null} />;
}
