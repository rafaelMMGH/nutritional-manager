import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/http/auth";

// Session for Server Components: one lookup per request, and signed-out visitors go to /login.
export const getPageSession = cache(async () => {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return session;
});
