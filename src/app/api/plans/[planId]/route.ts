import { now } from "@/lib/domain/nutrition";
import { badRequest, json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { toRecord } from "@/lib/storage/store";
import { planPatchSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ planId: string }> };

const findPlan = (planId: string, userId: string) => prisma.plan.findFirst({ where: { id: planId, user_id: userId, deleted_at: null } });

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { planId } = await params;
  const plan = await findPlan(planId, auth.user.id);
  if (!plan) return notFound();
  const [versions, pdf] = await Promise.all([
    prisma.planVersion.findMany({ where: { plan_id: plan.id, deleted_at: null }, orderBy: { seq: "asc" } }),
    prisma.uploadedPdf.findFirst({ where: { plan_id: plan.id, deleted_at: null }, orderBy: { seq: "asc" } })
  ]);
  return json({
    plan: toRecord("plans", plan),
    versions: versions.map((version) => toRecord("planVersions", version)),
    pdf: pdf ? toRecord("uploadedPdfs", pdf) : undefined
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = planPatchSchema.parse(await request.json());
    const { planId } = await params;
    const plan = await findPlan(planId, auth.user.id);
    if (!plan) return notFound();
    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: { name: body.name ?? plan.name, objective: body.objective ?? plan.objective, processing_status: body.processing_status ?? plan.processing_status, updated_at: now() }
    });
    return json({ plan: toRecord("plans", updated) });
  } catch (error) {
    return badRequest(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  const { planId } = await params;
  const plan = await findPlan(planId, auth.user.id);
  if (!plan) return notFound();
  await prisma.plan.update({ where: { id: plan.id }, data: { deleted_at: now(), updated_at: now() } });
  return json({ ok: true });
}
