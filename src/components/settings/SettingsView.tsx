import { qty } from "@/components/dashboard/food";
import type { getSettings } from "@/lib/domain/queries";

// Read-only for now, so it renders on the server.
export function SettingsView({ ingredients, settings }: Pick<ReturnType<typeof getSettings>, "ingredients" | "settings">) {
  return (
    <section className="split">
      <article className="card">
        <h2>Ingredientes</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Categoria</th><th>Unidad</th></tr></thead>
            <tbody>{ingredients.map((item) => <tr key={item.id}><td>{item.canonical_name}</td><td>{item.category}</td><td>{item.primary_unit}</td></tr>)}</tbody>
          </table>
        </div>
      </article>
      <article className="card">
        <h2>Al gusto</h2>
        <p>Excluidos: {settings.excludedAlGusto.join(", ")}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ingrediente</th><th>Default</th></tr></thead>
            <tbody>{Object.entries(settings.alGustoDefaults).map(([name, value]) => <tr key={name}><td>{name}</td><td>{qty(value.quantity)} {value.unit}</td></tr>)}</tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
