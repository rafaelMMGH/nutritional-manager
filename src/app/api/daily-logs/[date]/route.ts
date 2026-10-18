import { id, now } from "@/lib/domain/nutrition";
import { badRequest, json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { dailyLogSchema, isoDateSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ date: string }> };

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const date = isoDateSchema.parse((await params).date);
    const body = dailyLogSchema.parse(await request.json());
    const day = new Date(`${date}T00:00:00.000Z`);
    const changes = {
      ...(body.meals_done ? { meals_done: [...new Set(body.meals_done)] } : {}),
      ...(body.water_glasses !== undefined ? { water_glasses: body.water_glasses } : {}),
      ...(body.weight_kg !== undefined ? { weight_kg: body.weight_kg } : {}),
      ...(body.exercised !== undefined ? { exercised: body.exercised } : {}),
      updated_at: now()
    };
    // One row per user and day (unique index): upsert so two first saves of a day can't create two rows.
    const log = await prisma.dailyLog.upsert({
      where: { user_id_date: { user_id: auth.user.id, date: day } },
      update: changes,
      create: { id: id(), user_id: auth.user.id, date: day, meals_done: [], water_glasses: 0, created_at: now(), ...changes }
    });
    return json({ log: { date, meals_done: log.meals_done, water_glasses: log.water_glasses, weight_kg: log.weight_kg, exercised: log.exercised } });
  } catch (error) {
    return badRequest(error);
  }
}
