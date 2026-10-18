import { now } from "@/lib/domain/nutrition";
import { json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { toRecord, type Collection } from "@/lib/storage/store";

type Params = { params: Promise<{ type: string; entityId: string }> };

type Restorable = {
  updateMany(args: { where: { id: string; user_id: string }; data: { deleted_at: null; updated_at: string } }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
};

const tables: Record<string, [Restorable, Collection]> = {
  plan: [prisma.plan as unknown as Restorable, "plans"],
  recipe: [prisma.recipe as unknown as Restorable, "recipes"],
  shopping_list: [prisma.shoppingList as unknown as Restorable, "shoppingLists"],
  template: [prisma.shoppingTemplate as unknown as Restorable, "shoppingTemplates"]
};

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { type, entityId } = await params;
  const entry = Object.hasOwn(tables, type) ? tables[type] : undefined;
  if (!entry) return notFound();
  const [table, collection] = entry;
  const { count } = await table.updateMany({ where: { id: entityId, user_id: auth.user.id }, data: { deleted_at: null, updated_at: now() } });
  const item = count ? await table.findUnique({ where: { id: entityId } }) : null;
  if (!item) return notFound();
  return json({ item: toRecord(collection, item) });
}
