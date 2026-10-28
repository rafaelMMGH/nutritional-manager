# Contract: `POST /api/rag/chat`

**Spec:** [../spec.md](../spec.md) (v1.5) · **Plan:** [../plan.md](../plan.md)

Additive change (REQ-1). Old clients reading only `answer`, `context_used` and `sources` keep working.

## Request

```ts
{ message: string; scope?: string; recipe_id?: string }
```

- `message`: trimmed, then `1 ≤ length ≤ 500` (UTF-16 code units, i.e. JS `string.length`). Otherwise the standard `badRequest` 400 response and no answer (REQ-10). Validation lives in `chatSchema`; this is not a migration.
- `scope` (wire value, default `"auto"`): `"auto"` (Todo), `"Plan activo"`, `"Recetario"`, `"Carrito"`, `"Receta"` (Esta receta). `"Carrito actual"` stays accepted as an alias of `"Carrito"`. Any other string is treated as `"auto"`.
- `recipe_id`: required for `"Receta"`; a missing, deleted or foreign recipe yields `kind: "missing_recipe"` (REQ-20).

## Response

```ts
type Span = { text: string; highlight?: true };   // highlight → <strong> (REQ-2)
type Rich = Span[];
type ScopeKey = "auto" | "Plan activo" | "Recetario" | "Carrito" | "Receta";
type ReplyKind = "answer" | "overview" | "unknown" | "out_of_scope" | "missing_recipe";

type ChatAnswer = {
  answer: string;            // unchanged: plain-text form (below)
  context_used: string;      // unchanged: "Todo el sistema" for auto, else the scope string as sent
  sources: string[];         // unchanged type; only data actually used (REQ-1, REQ-3)
  kind: ReplyKind;           // new: tells the client which chip list to derive (REQ-5)
  lead: Rich;                // new, non-empty
  body: string | null;       // new: the capability line for unknown replies, else null
  sections: { title: string; items: Rich[] }[];             // new, each ≤ 8 items incl. "y <n> más"
  follow_ups: { text: string; scope: ScopeKey }[];          // new: topic follow-ups for answer/overview, else []
};
```

- Sections with no items are omitted, from both `sections` and `answer` (spec v1.5). Examples: a recipe with no ingredients or no steps, a plan with zero meals, blank recommendations. The lead always shows.
- `answer` = lead text, then for each section its title line and one line per item, joined with `\n`; for unknown replies, lead then `body`. Span texts are concatenated with no separator.
- `follow_ups` are the topic's full list from the spec's Topics table, unfiltered. The client applies the repeat rule and derives every other chip list from `kind` (plan, "Chips").
- The API never returns an error-shaped answer; network/HTTP failures and the 15 s timeout are client-side (REQ-8).
- There is no `topic` field: no client code reads it (plan D1). Each topic's `follow_ups` list is distinct, so tests identify the winner by `kind` + `follow_ups`.

## Routing (REQ-19, REQ-20, REQ-6)

1. `scope === "Receta"` and the recipe is missing → `missing_recipe`.
2. Winner = `matchTopic(question)` (Tier 1 > 2 > 3; ties cart > recipes > plan; "cuándo" rule).
3. Winner present: answered in scope (Topics "Answers in") → `answer`; otherwise → `out_of_scope`.
4. No winner: `auto` → `unknown`; narrowed scope → `overview` of that scope (Recetario: recipe list, Carrito: cart, Plan activo: plan, Receta: this recipe).

`recipes` in `Receta` uses the "this recipe" builder; in `auto`/`Recetario` the recipe-list builder.

## Copy

All copy is **confirmed** (spec v1.4 Interaction details "Copy"; user decision 2026-10-26) and used verbatim; tests may assert it. Confirmed leads: "Estos son los horarios de tus comidas.", "Tu objetivo: <objetivo>", "Estas son tus recetas.", "Estas recetas coinciden con tu pregunta.", "Esto es lo que tienes en tu carrito.", "Sobre <receta>:". Section titles: "Comidas", "Suplementos", "Recomendaciones", "Recetas", "Ingredientes", "Preparación". Empty supplements item: "Sin suplementos registrados". Source strings are today's. Every section obeys the 8-item cap with "y <n> más", and a section with no items is omitted (spec v1.5).

| Builder | Lead | Sections (title: item) | Sources |
|---|---|---|---|
| Unknown / out-of-scope / missing | "No encontré eso en tu información." + body = capability line | none | none |
| Meal times | "Estos son los horarios de tus comidas." · no times: "Tu plan no tiene horarios para tus comidas." · no plan: "No tienes un plan activo." | "Comidas": `<meal>` + ` · ` + **`<time_window>`** (time only when present) | `Plan activo: <name>` |
| Plan | "Tu objetivo: <objetivo>" · no plan: "No tienes un plan activo." | "Comidas": meal names; "Suplementos" (when suplement*): names, or "Sin suplementos registrados"; "Recomendaciones" (when recomend*): one item per non-empty line (spec v1.5) | `Plan activo: <name>` |
| Recipe list | all: "Estas son tus recetas." · filtered: "Estas recetas coinciden con tu pregunta." · none: "Aún no tienes recetas." | "Recetas": names | `Recetario` |
| Cart | "Esto es lo que tienes en tu carrito." · empty: "Tu carrito está vacío." | "Ingredientes": `<name>` + ` · ` + **`<qty> <unit>`** | `Carrito actual` |
| This recipe | "Sobre <receta>:" | "Ingredientes": `<name>` + ` · ` + **`<qty> <unit>`**; "Preparación": one item per non-empty step line | `Receta: <name>` |

Empty-state answers (empty cart, no plan, no recipes) have no sources: no data was used. Meal times come from the stored plan (confirmed): `structured_data.meals[].time_window` verbatim, in plan order (the meal-types PATCH keeps it in sync). The assistant reports what is in the plan; the dashboard's default times are not used.

**This recipe narrowing (today's rule, kept):** `named` = ingredients with a word of 3+ letters contained in the normalized question. `aboutPreparation` = `/prepar|como|cocin|paso|hace/` on the normalized question. Ingredients section shows when `named` is non-empty, or the question is not about preparation, or there are no instructions (listing `named` if any, else all). Preparation shows when instructions exist and (`aboutPreparation` or nothing was named). So "¿Cuánto pollo lleva?" lists only the pollo ingredients and no preparation (REQ-1 G/W/T).

**Recipe-list filter (REQ-1):** words of the normalized question, minus Topics-vocabulary words (incl. stems and "cuando") and the spec's stop words; a recipe matches when a remaining word of 3+ letters equals a word of its normalized name; no remaining word or no match → all recipes.
