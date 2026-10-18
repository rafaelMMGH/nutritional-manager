import type { Metadata } from "next";
import { CartView } from "@/components/groceries/CartView";
import { isReadableName, normalize } from "@/components/dashboard/food";
import { consolidateCart } from "@/lib/domain/cart";
import { loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Carrito · Nutritional Manager" };

export default async function CartPage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "cart");
  const { ingredients, sources } = consolidateCart(db, user.id);
  // Every ingredient already stored for this user, once per name, for the manual-add autocomplete.
  const known = new Map<string, { name: string; category: string; unit: string }>();
  for (const item of db.ingredients) {
    if (item.user_id !== user.id || item.deleted_at || !isReadableName(item.canonical_name)) continue;
    const key = normalize(item.canonical_name);
    if (!known.has(key)) known.set(key, { name: item.canonical_name, category: item.category, unit: item.primary_unit });
  }
  const knownList = [...known.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  return <CartView ingredients={ingredients} sources={sources} known={knownList} />;
}
