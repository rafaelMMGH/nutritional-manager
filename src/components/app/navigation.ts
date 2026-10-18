import { CalendarCheck, ClipboardList, Settings, ShoppingCart, Trash2, Utensils } from "lucide-react";

export type ViewKey = "dashboard" | "plans" | "recipes" | "groceries" | "settings" | "trash";

const ROUTES: Record<ViewKey, string> = {
  dashboard: "/",
  plans: "/plans",
  recipes: "/recipes",
  groceries: "/groceries",
  settings: "/settings",
  trash: "/trash"
};

export function hrefFor(view: ViewKey) {
  return ROUTES[view];
}

export const mainNav: { key: ViewKey; label: string; icon: any }[] = [
  { key: "dashboard", label: "Hoy", icon: CalendarCheck },
  { key: "plans", label: "Planes", icon: ClipboardList },
  { key: "recipes", label: "Recetario", icon: Utensils },
  { key: "groceries", label: "Compras", icon: ShoppingCart }
];

export const accountNav: { key: ViewKey; label: string; icon: any }[] = [
  { key: "settings", label: "Configuración", icon: Settings },
  { key: "trash", label: "Papelera", icon: Trash2 }
];

// Which nav item a URL belongs to, e.g. "/recipes/abc" -> recipes.
export function activeView(pathname: string): ViewKey {
  const match = (Object.entries(ROUTES) as [ViewKey, string][]).find(([, href]) => href !== "/" && (pathname === href || pathname.startsWith(`${href}/`)));
  return match ? match[0] : "dashboard";
}
