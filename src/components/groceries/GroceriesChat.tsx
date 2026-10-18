"use client";

import { askRag, useAssistantContext } from "@/components/app/assistant";

// Points the floating assistant at the cart and the recipes while a Compras page is open.
export function GroceriesChat() {
  useAssistantContext({
    subtitle: "Sobre tus compras",
    suggestions: ["¿Qué tengo en mi carrito?", "¿Qué ingredientes necesito comprar?", "¿Qué recetas hay en mi plan?"],
    ask: (message) => askRag(message, "Carrito")
  });
  return null;
}
