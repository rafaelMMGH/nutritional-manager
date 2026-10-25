# Bug: shopping cart counts deleted recipes and repeats meal add-ons

**Status:** fixed · **Branch:** fix/shopping-list-quick

Source: `specs/bugs/shopping-list-findings.md` #2 and #5. #11 (deleted lists / templates) moved to the spec-change backlog item (2026-10-24).

## Symptom

- **#2** A recipe moved to the Papelera still adds its ingredients to the Carrito (and its "Generar lista").
- **#5** A meal's required complements ("Acompañar tus X con…") are counted once per recipe in the cart: two Desayuno options → Café ×2.

## Reproduction

- **#2** Add a recipe to the cart, delete it, open the Carrito. Expected: its ingredients and source are gone, and come back after restoring it from the Papelera. Actual: still counted.
- **#5** Add two options of the same meal (that meal has a required add-on) with multiplier 1 each. Expected: the add-on qty is the add-on's own quantity once. Actual: twice.

## Root cause

- **#2** `src/lib/domain/cart.ts:27` finds the recipe without checking `deleted_at`. Recipe delete (`api/recipes/[recipeId]/route.ts:26-33`) does not touch cart items.
- **#5** `addOnUsages` (`cart.ts:6-16`) is called per recipe cart item (`cart.ts:30`), and every usage is multiplied by that item's multiplier (`cart.ts:45`).

## Fix (decided)

- **#2** Read-time filter in `consolidateCart`: skip recipe items whose recipe is missing or has `deleted_at` (not in `sources`, no usages). Restore makes the recipe count again. Cart items are not modified.
- **#5** (revised 2026-10-24) Options of a meal are treated as **alternatives**. Each meal's (`meal_type_id`) add-ons are counted once across the cart, multiplied by the **largest** multiplier (`quantity_multiplier || period_days || 1`) among the live recipe items with `include_add_ons` that belong to that meal in the active plan. Examples: two options ×1 → ×1; planner 4+3 → ×4. A recipe in two meals contributes to both. Items with `include_add_ons` false, deleted recipes and recipes not in the active plan contribute nothing.
  - Known trade-off, accepted by the user: a planner rotation (4+3) now gets the add-on for the longest option only, not all 7 days. Exact counts need the day-by-day meal-slot feature (backlog).
  - Rejected: "sum of multipliers". That equals the pre-fix arithmetic, so it fixed nothing.

## Regression test

E2E, `tests/e2e/dashboard.spec.ts`, both fail before their fix and pass after:

- #2: "a recipe in the Papelera leaves the cart, and counts again once restored"
- #5: "a meal's required add-ons count once, scaled by the largest multiplier among its options" (options ×4 and ×3 → ×4; ×1 and ×1 → ×1; larger option without add-ons → follows the remaining option's ×3)
