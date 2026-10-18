import { generateShoppingList } from "@/lib/domain/cart";
import { loadFor } from "@/lib/domain/queries";
import { badRequest, json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { insertAppended, mark } from "@/lib/storage/store";
import { generateListSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = generateListSchema.parse(await request.json());
    const db = await loadFor(auth.user, "cart");
    const marks = mark(db, ["shoppingLists", "shoppingListItems"]);
    const result = generateShoppingList(db, auth.user.id, body);
    await prisma.$transaction((tx) => insertAppended(tx, db, marks));
    return json(result);
  } catch (error) {
    return badRequest(error);
  }
}
