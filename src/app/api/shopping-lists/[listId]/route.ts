import { now } from "@/lib/domain/nutrition";
import { json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";

type Params = { params: Promise<{ listId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { listId } = await params;
  await prisma.shoppingList.updateMany({ where: { id: listId, user_id: auth.user.id, deleted_at: null }, data: { deleted_at: now(), updated_at: now() } });
  return json({ ok: true });
}
