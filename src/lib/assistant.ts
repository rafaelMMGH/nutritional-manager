// Shared by the assistant UI and the chat API (spec assistant-chat-polish). Pure on purpose: no db or Node imports,
// so both the client bundle and the server can load it.

/** Longest message, in UTF-16 code units, counted on the trimmed text (REQ-10). */
export const MAX_MESSAGE = 500;
/** Length from which the composer shows the "n/500" counter. */
export const COUNTER_FROM = 450;

/** Wire values of the `scope` request field. "Receta" is "Esta receta" in the UI. */
export type ScopeKey = "auto" | "Plan activo" | "Recetario" | "Carrito" | "Receta";

export const SCOPE_LABEL: Record<ScopeKey, string> = {
  auto: "Todo",
  "Plan activo": "Plan activo",
  Recetario: "Recetario",
  Carrito: "Carrito",
  Receta: "Esta receta"
};

/** Maps a wire value to a scope: "Carrito actual" is an alias of "Carrito", anything unknown is "auto" (contract). */
export function toScopeKey(value: unknown): ScopeKey {
  if (value === "Carrito actual") return "Carrito";
  return typeof value === "string" && Object.hasOwn(SCOPE_LABEL, value) ? (value as ScopeKey) : "auto";
}

/**
 * Lowercase, accent-free text without the leading and trailing ¿ ? ¡ ! . characters (spec Terms).
 * Whitespace is trimmed first and after the strip, so "  ¿Hola?  " and "hola" compare equal.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/^[¿?¡!.\s]+|[¿?¡!.\s]+$/g, "");
}

/** The words of a text: maximal runs of letters and digits of its normalized form. */
export function words(value: string): string[] {
  return normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Length that every limit uses: the trimmed text's `.length`. */
export function messageLength(value: string): number {
  return value.trim().length;
}

// Response of POST /api/rag/chat (contracts/chat-api.md). `answer`, `context_used` and `sources` are the original fields.
export type Span = { text: string; highlight?: true };
export type Rich = Span[];
export type ReplyKind = "answer" | "overview" | "unknown" | "out_of_scope" | "missing_recipe";
export type FollowUp = { text: string; scope: ScopeKey };
export type Section = { title: string; items: Rich[] };

export type ChatAnswer = {
  answer: string;
  context_used: string;
  sources: string[];
  kind: ReplyKind;
  lead: Rich;
  body: string | null;
  sections: Section[];
  follow_ups: FollowUp[];
};

/** A suggestion or follow-up: its text, the scope it is asked in and, for "Receta", the recipe it is about. */
export type Chip = { text: string; scope: ScopeKey; recipeId?: string };

const chip = (text: string, scope: ScopeKey): Chip => ({ text, scope });

/** Starter questions of the dashboard and of every page without its own list. Default scope: Todo. */
export function dashboardSuggestions(): Chip[] {
  return [chip("¿Qué recetas hay en mi plan?", "Recetario"), chip("¿Qué tengo en mi carrito?", "Carrito"), chip("¿Qué ingredientes necesito comprar?", "Carrito")];
}

/** Starter questions of the groceries pages. Default scope: Carrito. */
export function groceriesSuggestions(): Chip[] {
  return [chip("¿Qué tengo en mi carrito?", "Carrito"), chip("¿Qué ingredientes necesito comprar?", "Carrito"), chip("¿Qué recetas hay en mi plan?", "Recetario")];
}

/**
 * Starter questions of a recipe page. Default scope: Esta receta. The protein question appears only when the recipe
 * has a protein ingredient (its name is passed in); it has no topic word, so the narrowed recipe answer is its reply.
 */
export function recipeSuggestions(recipeId: string, proteinName?: string | null): Chip[] {
  const about = (text: string): Chip => ({ text, scope: "Receta", recipeId });
  return [
    about("¿Qué ingredientes lleva?"),
    about("¿Cómo se prepara?"),
    ...(proteinName ? [about(`¿Cuánto ${proteinName.toLowerCase()} lleva?`)] : []),
    chip("¿Qué tengo en mi carrito?", "Carrito")
  ];
}
