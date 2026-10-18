import { json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";

export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  return json({ user: auth.user });
}
