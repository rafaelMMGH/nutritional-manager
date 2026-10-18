"use client";

import { useRouter } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { useShell } from "@/components/app/AppShell";
import { hrefFor, type ViewKey } from "@/components/app/navigation";
import type { dashboardSummary } from "@/lib/domain/queries";

type Props = {
  user: { name: string; email: string };
  goals: { weight_goal_kg: number | null; activity_goal_days: number };
  dashboard: ReturnType<typeof dashboardSummary>;
  cartIngredients: unknown[];
  latestList: unknown;
};

// The dashboard still asks for the old sections; they all live under Compras now.
const LEGACY_TARGETS: Record<string, string> = { lists: "/groceries/cart", planning: "/groceries", templates: "/groceries/templates" };

// Connects the dashboard widgets to routing and the shell (upload wizard, assistant, refresh).
export function HomeView({ user, goals, dashboard, cartIngredients, latestList }: Props) {
  const router = useRouter();
  const shell = useShell();
  return (
    <DashboardView
      data={{ dashboard, cart: { ingredients: cartIngredients }, latestList }}
      user={user}
      goals={goals}
      setView={(next: string) => router.push(LEGACY_TARGETS[next] ?? hrefFor(next as ViewKey))}
      setWizard={() => shell.openUpload()}
      refresh={async () => shell.refresh()}
      askAssistant={shell.askAssistant}
    />
  );
}
