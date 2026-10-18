import { addCartItem, consolidateCart } from "@/lib/domain/cart";
import { loadFor } from "@/lib/domain/queries";
import { badRequest, json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { insertAppended, mark } from "@/lib/storage/store";
import { cartItemSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = cartItemSchema.parse(await request.json());
    const db = await loadFor(auth.user, "cart");
    // Manual items may also create a catalog ingredient (and a usage already marked deleted).
    const marks = mark(db, ["ingredients", "ingredientUsages", "cartItems"]);
    const item = addCartItem(db, auth.user.id, body);
    await prisma.$transaction((tx) => insertAppended(tx, db, marks));
    return json({ item, cart: consolidateCart(db, auth.user.id) });
  } catch (error) {
    return badRequest(error);
  }
}
