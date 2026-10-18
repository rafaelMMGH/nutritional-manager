import type { Metadata } from "next";
import { TemplatesView } from "@/components/groceries/TemplatesView";
import { consolidateCart } from "@/lib/domain/cart";
import { listTemplates, loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Plantillas · Nutritional Manager" };

export default async function TemplatesPage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "templates", "cart");
  const templates = listTemplates(db, user.id).map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    created_at: template.created_at,
    itemCount: (template.reference_snapshot as { items?: unknown[] } | null)?.items?.length ?? 0
  }));
  return <TemplatesView templates={templates} cartCount={consolidateCart(db, user.id).ingredients.length} />;
}
