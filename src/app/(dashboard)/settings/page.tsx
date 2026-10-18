import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/SettingsView";
import { PageHeader } from "@/components/shared/PageHeader";
import { getSettings, loadFor } from "@/lib/domain/queries";
import { getPageSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Configuración · Nutritional Manager" };

export default async function SettingsPage() {
  const { user } = await getPageSession();
  const db = await loadFor(user, "settings");
  const { ingredients, settings } = getSettings(db, user.id);
  return (
    <>
      <PageHeader title="Configuración" subtitle="Catálogo maestro, categorías y valores por defecto." />
      <SettingsView ingredients={ingredients} settings={settings} />
    </>
  );
}
