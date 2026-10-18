import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { getPageSession } from "@/lib/server/session";

// Every signed-in page shares this frame.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = await getPageSession();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
