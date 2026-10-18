import { ragAnswer } from "@/lib/domain/chat";
import { loadFor } from "@/lib/domain/queries";
import { badRequest, json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { chatSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = chatSchema.parse(await request.json());
    const db = await loadFor(auth.user, "cart", "recipes");
    return json(ragAnswer(db, auth.user.id, body.message, body.scope, body.recipe_id));
  } catch (error) {
    return badRequest(error);
  }
}
