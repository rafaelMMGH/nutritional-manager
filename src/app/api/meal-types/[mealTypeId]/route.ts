import type { Prisma } from "@/generated/prisma/client";
import type { StructuredPlan } from "@/lib/types";
import { now } from "@/lib/domain/nutrition";
import { badRequest, json, notFound } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { toRecord } from "@/lib/storage/store";
import { mealTypePatchSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ mealTypeId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = mealTypePatchSchema.parse(await request.json());
    const { mealTypeId } = await params;
    const mealType = await prisma.mealType.findFirst({
      where: { id: mealTypeId, deleted_at: null, planVersion: { deleted_at: null, plan: { user_id: auth.user.id, deleted_at: null } } },
      include: { planVersion: true }
    });
    if (!mealType) return notFound();
    // Keep the version's structured copy of the meal in sync when it is the same meal.
    const structured = mealType.planVersion.structured_data as StructuredPlan;
    const meal = structured.meals[mealType.display_order - 1];
    if (meal?.name === mealType.name) meal.time_window = body.time_window;
    const [updated] = await prisma.$transaction([
      prisma.mealType.update({ where: { id: mealType.id }, data: { time_window: body.time_window } }),
      prisma.planVersion.update({ where: { id: mealType.plan_version_id }, data: { structured_data: structured as unknown as Prisma.InputJsonValue, updated_at: now() } })
    ]);
    return json({ mealType: toRecord("mealTypes", updated) });
  } catch (error) {
    return badRequest(error);
  }
}
