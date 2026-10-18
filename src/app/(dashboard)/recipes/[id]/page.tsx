import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeDetail } from "@/components/recipes/RecipeDetail";
import { findRecipe } from "@/lib/domain/plans";
import { loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

type Props = { params: Promise<{ id: string }> };

async function loadRecipe(params: Props["params"]) {
  const { id } = await params;
  const { user } = await getPageSession();
  const db = await loadFor(user, "recipes");
  return findRecipe(db, user.id, id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const recipe = await loadRecipe(params);
  return { title: `${recipe?.name ?? "Receta"} · Nutritional Manager` };
}

export default async function RecipePage({ params }: Props) {
  const recipe = await loadRecipe(params);
  if (!recipe) notFound();
  return <RecipeDetail recipe={recipe} />;
}
