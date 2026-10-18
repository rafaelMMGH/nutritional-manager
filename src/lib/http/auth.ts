import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/storage/pg";
import { toUser } from "@/lib/storage/store";

export async function getSessionUser() {
  const token = (await cookies()).get("nm_session")?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.user.deleted_at) return null;
  return { user: toUser(session.user) };
}

export function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

export async function requireSession() {
  const auth = await getSessionUser();
  if (!auth) return { response: unauthorized() as NextResponse, user: null } as const;
  return { response: null, user: auth.user } as const;
}
