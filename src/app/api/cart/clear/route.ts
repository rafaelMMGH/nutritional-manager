import { consolidateCart } from "@/lib/domain/cart";
import { now } from "@/lib/domain/nutrition";
import { loadFor } from "@/lib/domain/queries";
import { json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";

export async function POST() {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const cart = await prisma.cart.findFirst({ where: { user_id: auth.user.id, status: "active" }, orderBy: { seq: "asc" } });
  if (cart) await prisma.cartItem.updateMany({ where: { cart_id: cart.id, deleted_at: null }, data: { deleted_at: now() } });
  return json(consolidateCart(await loadFor(auth.user, "cart"), auth.user.id));
}
