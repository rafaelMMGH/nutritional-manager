import type { ReactNode } from "react";

// Title row used at the top of each section page.
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="toolbar">{actions}</div>
    </div>
  );
}
