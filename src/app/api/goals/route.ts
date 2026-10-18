import { now } from "@/lib/domain/nutrition";
import { badRequest, json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { goalsSchema } from "@/lib/validation/schemas";

// Weekly report goals (target weight, exercise days per week) live on the user.
export async function PUT(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const body = goalsSchema.parse(await request.json());
    const user = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        ...(body.weight_goal_kg !== undefined ? { weight_goal_kg: body.weight_goal_kg } : {}),
        ...(body.activity_goal_days !== undefined ? { activity_goal_days: body.activity_goal_days } : {}),
        updated_at: now()
      }
    });
    return json({ goals: { weight_goal_kg: user.weight_goal_kg, activity_goal_days: user.activity_goal_days } });
  } catch (error) {
    return badRequest(error);
  }
}
