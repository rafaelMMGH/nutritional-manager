"use client";

import { useAssistantContext } from "@/components/app/assistant";
import { groceriesSuggestions } from "@/lib/assistant";

// Points the floating assistant at the cart and the recipes while a Compras page is open.
export function GroceriesChat() {
  useAssistantContext({ subtitle: "Sobre tus compras", defaultScope: "Carrito", suggestions: groceriesSuggestions() });
  return null;
}
