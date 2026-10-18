import type { ShoppingTemplate } from "@/lib/types";
import { consolidateCart } from "@/lib/domain/cart";
import { id, now } from "@/lib/domain/nutrition";
import { loadFor } from "@/lib/domain/queries";
import { badRequest, json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { insertRecord } from "@/lib/storage/store";
import { loadTemplateSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ templateId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = loadTemplateSchema.parse(await request.json());
    const { templateId } = await params;
    const template = await prisma.shoppingTemplate.findFirst({ where: { id: templateId, user_id: auth.user.id, deleted_at: null } });
    if (!template) return notFound();
    const cart = await prisma.cart.findFirst({ where: { user_id: auth.user.id, status: "active" }, orderBy: { seq: "asc" } });
    if (!cart) return notFound();
    const syntheticList = (template.reference_snapshot as ShoppingTemplate["reference_snapshot"]).list;
    await prisma.$transaction(async (tx) => {
      if (body.mode !== "append") await tx.cartItem.updateMany({ where: { cart_id: cart.id, deleted_at: null }, data: { deleted_at: now() } });
      await insertRecord(tx, "cartItems", {
        id: id(),
        cart_id: cart.id,
        source_type: "shopping_list",
        source_id: syntheticList.id,
        quantity_multiplier: 1,
        period_days: syntheticList.period_days || 0,
        training_days: 0,
        selected_alternatives: {},
        include_add_ons: true,
        include_supplements: false,
        created_at: now(),
        updated_at: now(),
        deleted_at: null
      });
    });
    return json({ warning: "Plantilla cargada desde snapshot. Si las fuentes originales cambiaron, revisa la lista consolidada.", cart: consolidateCart(await loadFor(auth.user, "cart"), auth.user.id) });
  } catch (error) {
    return badRequest(error);
  }
}
