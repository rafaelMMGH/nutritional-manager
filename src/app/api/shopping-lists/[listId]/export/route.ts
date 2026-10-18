import { exportList } from "@/lib/domain/cart";
import { loadFor } from "@/lib/domain/queries";
import { badRequest, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { exportSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ listId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = exportSchema.parse(await request.json());
    const { listId } = await params;
    const db = await loadFor(auth.user, "shoppingLists");
    const list = db.shoppingLists.find((item) => item.id === listId && item.user_id === auth.user.id && !item.deleted_at);
    if (!list) return notFound();
    return new Response(exportList(db, list, body.format), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    return badRequest(error);
  }
}
