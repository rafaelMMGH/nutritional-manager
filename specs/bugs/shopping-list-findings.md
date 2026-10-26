# Investigation: how the shopping list sums ingredients

**Status:** open (findings only, nothing fixed) · **Date:** 2026-10-22 · **Source:** investigator, diagnose mode, read-only
**Line numbers** are from commit `c652db0` (main at the time). Re-check them before fixing, since the code may have moved.

## How it works

- **Totals are computed on the fly.** `consolidateCart` (`src/lib/domain/cart.ts:18-54`) builds them every time the cart is read. Cart items store references only (recipe id, manual line, or list id), never quantities.
- **Summing:** for each usage, `quantity = Number(practical_quantity || quantity || 1) * (quantity_multiplier || period_days || 1)` (`cart.ts:44-45`). Usages are bucketed by `ingredientKey(name) + "|" + unit` (`cart.ts:46`) and summed (`cart.ts:48`). The result is sorted by category, then name.
- **`ingredientKey`** (`src/lib/domain/nutrition.ts:117-128`) does NFD, strips accents, lowercases and trims. Then: "ces" becomes "z", a trailing "s" is dropped, and a trailing "e" after l/n/r/d is dropped when the stem is longer than 3. It has no synonyms (jitomate ≠ tomate).
- **Units are part of the key and are never converted.** `normUnit` (`pdf-plan.ts:111-115`) only normalizes spelling (gr/gramos → g, pzas → pieza).
- **Item sources:**
  - recipe (`useRecipeActions.ts:19`, multiplier 1)
  - period planner (`GroceriesView.tsx:98-106`)
  - catalog "+" (manual item)
  - template load (`templates/[templateId]/load-to-cart/route.ts:26-40`)
- **"Generar lista"** (`cart.ts:88-124`) freezes the result into `shoppingLists` / `shoppingListItems`, with every row set to "Pendiente". Check-off (`PATCH …/items/[itemId]`) only sets the status.
- **Line parsing happens once, at PDF upload** (`pdf-plan.ts` `parsePart` 288-317).
  - It handles quantity-first and name-first lines, fractions, "1 1/2" and "1,5".
  - For ranges, the lower bound is kept and the range goes into notes.
  - Lines with no quantity become "al gusto" with quantity 0.
  - Salt, pepper and spices are dropped.

## Findings

| # | Issue | Where | Example (verified by probe unless noted) | Severity |
|---|---|---|---|---|
| 1 | The period planner overcounts days: each recipe gets `ceil(days / n)` | `GroceriesView.tsx:104`, `queries.ts:70`, `CartView.tsx:22` | 7 days × 2 recipes → 8 planned days, Pollo ×8 | HIGH |
| 2 | Soft-deleted recipes still counted. There is no `deleted_at` check, and recipe delete doesn't touch cart items | `cart.ts:27`, `recipes/[recipeId]/route.ts:30` | A deleted recipe's "Papa 2 pieza" still appears | HIGH |
| 3 | A quantity with no unit silently becomes "pieza" | `pdf-plan.ts:304` | "100 de queso" → 100 pieza | MEDIUM |
| 4 | Unit mismatch gives split rows, with no conversion and no warning | `cart.ts:46` | Avena 0.5 taza + Avena 100 g → 2 rows | MEDIUM |
| 5 | Add-ons are counted once per recipe added, not once per meal | `cart.ts:6-16, 30` | 2 options for the same meal → Café ×2 | MEDIUM |
| 6 | The "Ingredientes" catalog shows the first occurrence's quantity, not a total, and its "+" adds that amount | `queries.ts:84-88`, `useRecipeActions.ts:29-33` | Ingredientes and Carrito show different amounts (code reading, not probed) | MED–HIGH |
| 7 | A null or 0 quantity falls back to 1, then gets multiplied by days | `cart.ts:45` | Sal (null) × 7 days → 7 | LOW–MED |
| 8 | Alternatives end up in notes and never reach the cart. `selected_alternatives` is stored but never read | `pdf-plan.ts:409-410`, `cart.ts:73` | "1 taza de leche o 2 cdas…" → only the first | LOW |
| 9 | `training_days`, `include_supplements` and `selected_alternatives` are saved but unused. The "Entrenamiento" input changes nothing | `cart.ts:72-75`, `GroceriesView.tsx:96, 133` | The control has no effect | MEDIUM |
| 10 | Dead `practical_*` path: read, but never set by the parser | `nutrition.ts:175-176`, `cart.ts:44-45` | Dead code | LOW |
| 11 | Template load reads the live list, not the snapshot the comment promises. Deleted lists still count, and saving a template creates a visible list | `templates/route.ts:17-18, 26`, `load-to-cart/route.ts:42`, `cart.ts:35` | Misleading comment and behavior | LOW–MED |
| 12 | Adding the same recipe twice doubles it, with no dedupe | `addCartItem` | Undocumented | LOW |
| 13 | Checked state lives per list. Regenerating resets everything to "Pendiente" | `cart.ts:115` | Consistent, but undocumented | LOW |

## Test coverage at the time

The only shopping test is `tests/e2e/dashboard.spec.ts` "the newest shopping list can be checked off". Nothing covers sums, units, multipliers, the planner, add-ons, soft-deleted recipes, templates or parser quantity/unit rules. There is no unit-test runner; adding one is a new dependency and needs the user's yes. So fixes need e2e tests (Constitution 1).

## Suggested routes

1. **Bug fix, quick:** #2 + #11 (skip soft-deleted recipes and lists in `consolidateCart`) and #5 (add-ons once per meal).
2. **Bug fix, needs a decision first:** #1. Should 7 days with 2 recipes be split 4+3 (rotation) or 7 each?
3. **Spec-change:** the unit policy for #3 and #4 (convert g/kg/taza, or flag mismatches, or `requires_review` instead of the "pieza" default), and what #8 and #9 should do (implement them or remove the controls).
4. **Refactor:** make #6 use the same summing key as `consolidateCart`, and remove the dead code in #10 and the misleading wording in #11.
5. **Feature (larger, needs a spec):** a day-by-day meal-slot expansion to replace the `period_days` multiplier.
