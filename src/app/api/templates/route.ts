import { generateShoppingList } from "@/lib/domain/cart";
import { id, now } from "@/lib/domain/nutrition";
import { listTemplates, loadFor } from "@/lib/domain/queries";
import { badRequest, json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { insertAppended, insertRecord, mark } from "@/lib/storage/store";
import { saveTemplateSchema } from "@/lib/validation/schemas";

export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const db = await loadFor(auth.user, "templates");
  return json({ templates: listTemplates(db, auth.user.id) });
}

// Saves the current cart as a template. The cart is frozen into a snapshot list, which is what
// "load to cart" reads back later, so the template keeps working if recipes change.
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = saveTemplateSchema.parse(await request.json());
    const db = await loadFor(auth.user, "cart");
    const marks = mark(db, ["shoppingLists", "shoppingListItems"]);
    const { list, items } = generateShoppingList(db, auth.user.id, { name: body.name });
    if (!items.length) throw new Error("El carrito está vacío");
    const template = {
      id: id(),
      user_id: auth.user.id,
      name: body.name || list.name,
      description: body.description || "",
      source_config: list.snapshot_data,
      reference_snapshot: { list, items },
      created_at: now(),
      updated_at: now(),
      deleted_at: null
    };
    await prisma.$transaction(async (tx) => {
      await insertAppended(tx, db, marks);
      await insertRecord(tx, "shoppingTemplates", template);
    });
    return json({ template });
  } catch (error) {
    return badRequest(error);
  }
}
