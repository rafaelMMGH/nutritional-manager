import type { Metadata } from "next";
import { PlansView, UploadPlanButton } from "@/components/plans/PlansView";
import { PageHeader } from "@/components/shared/PageHeader";
import { listPlans, loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Planes · Nutritional Manager" };

export default async function PlansPage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "plans");
  return (
    <>
      <PageHeader title="Planes" subtitle="Sube PDFs, revisa extracciones, activa o archiva planes." actions={<UploadPlanButton />} />
      <PlansView plans={listPlans(db, user.id)} />
    </>
  );
}
