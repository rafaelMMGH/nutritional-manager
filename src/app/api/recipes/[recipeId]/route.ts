import { now } from "@/lib/domain/nutrition";
import { badRequest, json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { recipePatchSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ recipeId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = recipePatchSchema.parse(await request.json());
    const { recipeId } = await params;
    const { count } = await prisma.recipe.updateMany({
      where: { id: recipeId, user_id: auth.user.id, deleted_at: null },
      data: { ...body, updated_at: now() }
    });
    if (!count) return notFound();
    return json({ ok: true });
  } catch (error) {
    return badRequest(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { recipeId } = await params;
  const { count } = await prisma.recipe.updateMany({ where: { id: recipeId, user_id: auth.user.id, deleted_at: null }, data: { deleted_at: now() } });
  if (!count) return notFound();
  return json({ ok: true });
}
