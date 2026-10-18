import { listRecipes } from "@/lib/domain/plans";
import { loadFor } from "@/lib/domain/queries";
import { json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";

export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const db = await loadFor(auth.user, "recipes");
  return json({ recipes: listRecipes(db, auth.user.id) });
}
