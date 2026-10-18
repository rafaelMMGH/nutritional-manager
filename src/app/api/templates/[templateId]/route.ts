import { now } from "@/lib/domain/nutrition";
import { json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";

type Params = { params: Promise<{ templateId: string }> };

// Sends the template to the trash; it can be restored from Papelera.
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { templateId } = await params;
  const { count } = await prisma.shoppingTemplate.updateMany({ where: { id: templateId, user_id: auth.user.id, deleted_at: null }, data: { deleted_at: now(), updated_at: now() } });
  if (!count) return notFound();
  return json({ ok: true });
}
