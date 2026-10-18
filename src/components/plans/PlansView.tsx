"use client";

import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShell } from "@/components/app/AppShell";
import { Action, Badge, Empty, confirmDialog } from "@/components/app/feedback";
import { api, getErrorMessage } from "@/lib/client/api";
import type { listPlans } from "@/lib/domain/queries";

type Plan = ReturnType<typeof listPlans>[number];

export function UploadPlanButton() {
  const { openUpload } = useShell();
  return (
    <Button onClick={openUpload}>
      <Upload size={16} />
      Subir PDF
    </Button>
  );
}

export function PlansView({ plans }: { plans: Plan[] }) {
  const { refresh } = useShell();

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
      await refresh();
    } catch (err) {
      toast.error("No se pudo completar la acción", { description: getErrorMessage(err) });
    }
  }

  async function activate(plan: Plan) {
    if (!(await confirmDialog("Activar plan", "Esto archivara el plan activo actual.", "Activar"))) return;
    await run(() => api(`/api/plans/${plan.id}/activate`, { method: "POST", body: "{}" }), "Plan activado");
  }

  async function confirm(plan: Plan) {
    await run(() => api(`/api/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify({ processing_status: "confirmed" }) }), "Plan confirmado");
  }

  async function remove(plan: Plan) {
    if (!(await confirmDialog("Enviar plan a papelera", "Podras restaurarlo desde Papelera.", "Eliminar"))) return;
    await run(() => api(`/api/plans/${plan.id}`, { method: "DELETE" }), "Plan enviado a papelera");
  }

  if (!plans.length) return <Empty message="No hay planes todavia." />;

  return (
    <section className="list">
      {plans.map((plan) => (
        <article className="item" key={plan.id}>
          <div className="row between">
            <div>
              <h3>{plan.name}</h3>
              <div className="row">
                <Badge tone={plan.status === "active" ? "success" : "neutral"}>{plan.status}</Badge>
                <Badge tone={plan.processing_status === "confirmed" ? "success" : "warn"}>{plan.processing_status}</Badge>
                <Badge>v{plan.current_version?.version_number || 1}</Badge>
              </div>
            </div>
            <div className="toolbar">
              {plan.status !== "active" && <Action label="Activar" onClick={() => activate(plan)} />}
              <Action label="Confirmar" onClick={() => confirm(plan)} />
              <Action danger label="Eliminar" onClick={() => remove(plan)} />
            </div>
          </div>
          <p>{plan.objective}</p>
        </article>
      ))}
    </section>
  );
}
