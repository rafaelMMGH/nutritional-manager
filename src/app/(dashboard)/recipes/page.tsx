import type { Metadata } from "next";
import { RecipesView } from "@/components/recipes/RecipesView";
import { listRecipes } from "@/lib/domain/plans";
import { loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Recetario · Nutritional Manager" };

export default async function RecipesPage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "recipes");
  return <RecipesView recipes={listRecipes(db, user.id)} />;
}
