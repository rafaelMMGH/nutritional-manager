import { consolidateCart } from "@/lib/domain/cart";
import { now } from "@/lib/domain/nutrition";
import { loadFor } from "@/lib/domain/queries";
import { json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";

type Params = { params: Promise<{ itemId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { itemId } = await params;
  const cart = await prisma.cart.findFirst({ where: { user_id: auth.user.id, status: "active" }, orderBy: { seq: "asc" } });
  if (cart) await prisma.cartItem.updateMany({ where: { id: itemId, cart_id: cart.id, deleted_at: null }, data: { deleted_at: now() } });
  return json(consolidateCart(await loadFor(auth.user, "cart"), auth.user.id));
}
