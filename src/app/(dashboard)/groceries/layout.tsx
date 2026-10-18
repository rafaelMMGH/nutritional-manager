import type { ReactNode } from "react";
import { GroceriesChat } from "@/components/groceries/GroceriesChat";
import { GroceriesNav } from "@/components/groceries/GroceriesNav";
import { consolidateCart } from "@/lib/domain/cart";
import { listGroceries, listTemplates, loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

// Compras: section rail on the left, the page in the middle, the assistant on the right.
export default async function GroceriesLayout({ children }: { children: ReactNode }) {
  const { user } = await getPageSession();
  const db = await loadFor(user, "cart", "recipes", "templates");
  const counts = {
    groceries: listGroceries(db, user.id).length,
    templates: listTemplates(db, user.id).length,
    cart: consolidateCart(db, user.id).ingredients.length
  };
  return (
    <div className="groceries-page">
      <GroceriesNav counts={counts} />
      <div className="groceries-main">{children}</div>
      <GroceriesChat />
    </div>
  );
}
