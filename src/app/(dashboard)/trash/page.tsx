import type { Metadata } from "next";
import { TrashView } from "@/components/trash/TrashView";
import { PageHeader } from "@/components/shared/PageHeader";
import { listTrash, loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Papelera · Nutritional Manager" };

export default async function TrashPage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "trash");
  return (
    <>
      <PageHeader title="Papelera" subtitle="Elementos eliminados que puedes restaurar." />
      <TrashView items={listTrash(db, user.id)} />
    </>
  );
}
