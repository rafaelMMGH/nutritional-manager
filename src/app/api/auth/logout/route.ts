import { cookies } from "next/headers";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/storage/pg";

export async function POST() {
  const token = (await cookies()).get("nm_session")?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  const response = json({ ok: true });
  response.cookies.set("nm_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
