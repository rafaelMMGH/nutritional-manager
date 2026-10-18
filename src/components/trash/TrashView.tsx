"use client";

import { toast } from "sonner";
import { useShell } from "@/components/app/AppShell";
import { Action, Empty } from "@/components/app/feedback";
import { api } from "@/lib/client/api";
import type { listTrash } from "@/lib/domain/queries";

type TrashItem = ReturnType<typeof listTrash>[number];

export function TrashView({ items }: { items: TrashItem[] }) {
  const { refresh } = useShell();

  async function restore(item: TrashItem) {
    await api(`/api/trash/${item.type}/${item.id}/restore`, { method: "POST", body: "{}" });
    toast.success("Elemento restaurado");
    refresh();
  }

  if (!items.length) return <Empty message="La papelera esta vacia." />;

  return (
    <section className="list">
      {items.map((item) => (
        <article className="item" key={`${item.type}:${item.id}`}>
          <div className="row between">
            <div><h3>{item.name}</h3><p>{item.type} · {new Date(item.deleted_at!).toLocaleString("es-MX")}</p></div>
            <Action label="Restaurar" onClick={() => restore(item)} />
          </div>
        </article>
      ))}
    </section>
  );
}
