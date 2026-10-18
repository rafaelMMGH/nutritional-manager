import { id, now } from "@/lib/domain/nutrition";
import { loadFor } from "@/lib/domain/queries";
import { badRequest, json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { insertRecord } from "@/lib/storage/store";
import { saveTemplateSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ listId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = saveTemplateSchema.parse(await request.json());
    const { listId } = await params;
    const db = await loadFor(auth.user, "shoppingLists");
    const list = db.shoppingLists.find((item) => item.id === listId && item.user_id === auth.user.id && !item.deleted_at);
    if (!list) return notFound();
    const template = {
      id: id(),
      user_id: auth.user.id,
      name: body.name || `${list.name} plantilla`,
      description: body.description || "",
      source_config: list.snapshot_data,
      reference_snapshot: { list, items: db.shoppingListItems.filter((item) => item.shopping_list_id === list.id && !item.deleted_at) },
      created_at: now(),
      updated_at: now(),
      deleted_at: null
    };
    await insertRecord(prisma, "shoppingTemplates", template);
    return json({ template });
  } catch (error) {
    return badRequest(error);
  }
}
