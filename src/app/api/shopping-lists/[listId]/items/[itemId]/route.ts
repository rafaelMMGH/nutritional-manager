import { Prisma } from "@/generated/prisma/client";
import { now } from "@/lib/domain/nutrition";
import { badRequest, json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { toRecord } from "@/lib/storage/store";
import { listItemStatusSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ listId: string; itemId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = listItemStatusSchema.parse(await request.json());
    const { listId, itemId } = await params;
    const item = await prisma.shoppingListItem.findFirst({
      where: { id: itemId, shopping_list_id: listId, deleted_at: null, shoppingList: { user_id: auth.user.id, deleted_at: null } }
    });
    if (!item) return notFound();
    const substitution = body.substitution_data ?? item.substitution_data;
    const updated = await prisma.shoppingListItem.update({
      where: { id: item.id },
      data: { status: body.status, substitution_data: substitution === null ? Prisma.DbNull : (substitution as Prisma.InputJsonValue), updated_at: now() }
    });
    return json({ item: toRecord("shoppingListItems", updated) });
  } catch (error) {
    return badRequest(error);
  }
}
