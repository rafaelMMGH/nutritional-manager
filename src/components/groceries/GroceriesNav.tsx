"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, ShoppingBag, ShoppingCart } from "lucide-react";

type Props = { counts: { groceries: number; templates: number; cart: number } };

const SECTIONS = [
  { href: "/groceries/cart", label: "Carrito", hint: "Tu lista actual", icon: ShoppingCart, count: "cart" },
  { href: "/groceries", label: "Ingredientes", hint: "De tus recetas", icon: ShoppingBag, count: "groceries" },
  { href: "/groceries/templates", label: "Plantillas", hint: "Listas frecuentes", icon: ClipboardList, count: "templates" }
] as const;

// Left rail of the Compras module: one link per section, the current one in yellow.
export function GroceriesNav({ counts }: Props) {
  const pathname = usePathname();
  return (
    <nav className="groceries-nav" aria-label="Compras">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const current = pathname === section.href;
        const count = counts[section.count];
        return (
          <Link key={section.href} href={section.href} className={current ? "groceries-nav-item on" : "groceries-nav-item"} aria-current={current ? "page" : undefined}>
            <Icon size={19} />
            <span>
              <strong>{section.label}</strong>
              <small>{section.hint}</small>
            </span>
            {count > 0 && <em>{count}</em>}
          </Link>
        );
      })}
    </nav>
  );
}
