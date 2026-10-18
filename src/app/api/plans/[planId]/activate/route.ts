import { id, now } from "@/lib/domain/nutrition";
import { json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { toRecord } from "@/lib/storage/store";

type Params = { params: Promise<{ planId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { planId } = await params;
  const plan = await prisma.plan.findFirst({ where: { id: planId, user_id: auth.user.id, deleted_at: null } });
  if (!plan) return notFound();
  const [, activated] = await prisma.$transaction([
    prisma.plan.updateMany({ where: { user_id: auth.user.id, deleted_at: null, id: { not: plan.id } }, data: { status: "archived" } }),
    prisma.plan.update({ where: { id: plan.id }, data: { status: "active", updated_at: now() } }),
    prisma.auditEvent.create({ data: { id: id(), user_id: auth.user.id, event: "plan_activated", entity_id: plan.id, created_at: now() } })
  ]);
  return json({ plan: toRecord("plans", activated) });
}
