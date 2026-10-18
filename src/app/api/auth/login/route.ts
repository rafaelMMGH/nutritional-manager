import { id, now } from "@/lib/domain/nutrition";
import { badRequest, json } from "@/lib/http/respond";
import { emptyDb } from "@/lib/storage/db";
import { prisma } from "@/lib/storage/pg";
import { insertRecord, toUser } from "@/lib/storage/store";
import { loginSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const token = id();
    const user = await prisma.$transaction(async (tx) => {
      let first = await tx.user.findFirst({ orderBy: { seq: "asc" } });
      if (!first) {
        // Empty database: seed the demo user and cart, as db.json did on first run.
        const seed = emptyDb();
        first = await tx.user.create({ data: seed.users[0] });
        await insertRecord(tx, "carts", seed.carts[0]);
      }
      const updated = await tx.user.update({ where: { id: first.id }, data: { email: body.email, name: body.name, updated_at: now() } });
      await tx.session.create({ data: { token, user_id: updated.id } });
      return toUser(updated);
    });
    const response = json({ user });
    response.cookies.set("nm_session", token, { httpOnly: true, sameSite: "lax", path: "/" });
    return response;
  } catch (error) {
    return badRequest(error);
  }
}
