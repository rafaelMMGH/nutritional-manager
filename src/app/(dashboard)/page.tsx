import type { Metadata } from "next";
import { HomeView } from "@/components/home/HomeView";
import { consolidateCart } from "@/lib/domain/cart";
import { dashboardSummary, listShoppingLists, loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Inicio · Nutritional Manager" };

export default async function HomePage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "dashboard", "cart", "shoppingLists");
  // The newest shopping list feeds the home's checkable list; without one, the home shows the cart.
  const latestList = listShoppingLists(db, user.id).at(-1) ?? null;
  return (
    <HomeView
      user={{ name: user.name, email: user.email }}
      goals={{ weight_goal_kg: user.weight_goal_kg ?? null, activity_goal_days: user.activity_goal_days ?? 4 }}
      dashboard={dashboardSummary(db, user.id)}
      cartIngredients={consolidateCart(db, user.id).ingredients}
      latestList={latestList}
    />
  );
}
