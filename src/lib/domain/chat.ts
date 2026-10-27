import type { AppDb, Recipe } from "@/lib/types";
import { type ChatAnswer, type FollowUp, type ReplyKind, type Rich, type ScopeKey, type Section, toScopeKey, words } from "@/lib/assistant";
import { consolidateCart } from "@/lib/domain/cart";
import { answersIn, followUpsFor, isTopicWord, matchTopic, type TopicId } from "@/lib/domain/chat-topics";
import { activePlan, recipeDetails } from "@/lib/domain/plans";
import { formatQty, normalize } from "@/lib/domain/nutrition";

const UNKNOWN_LEAD = "No encontré eso en tu información.";
const CAPABILITY_LINE = "Puedo ayudarte con tu plan de comidas y horarios, tus recetas e ingredientes, y tu lista de compras.";

type Reply = { kind: ReplyKind; lead: Rich; body?: string; sections?: Section[]; sources?: string[]; follow_ups?: FollowUp[] };

const plain = (rich: Rich) => rich.map((span) => span.text).join("");

/** The response with its plain-text `answer`: the lead, then the body or each section's title line and one line per item (contract). */
function reply(scope: string, { kind, lead, body, sections = [], sources = [], follow_ups = [] }: Reply): ChatAnswer {
  const lines = [plain(lead), ...(body ? [body] : []), ...sections.flatMap((section) => [section.title, ...section.items.map(plain)])];
  return { answer: lines.join("\n"), context_used: scope === "auto" ? "Todo el sistema" : scope, sources, kind, lead, body: body ?? null, sections, follow_ups };
}

const textLead = (text: string): Rich => [{ text }];
const NO_PLAN_LEAD = "No tienes un plan activo.";
const MAX_ITEMS = 8;

/** What a builder returns; `ragAnswer` adds the kind and the follow-ups. */
type Built = { lead: Rich; sections?: Section[]; sources?: string[] };

/** A section of plain items, capped at 8 with a last item "y <n> más" (REQ-1). With no items there is no section: the list is empty. */
function section(title: string, items: Rich[]): Section[] {
  if (!items.length) return [];
  if (items.length <= MAX_ITEMS) return [{ title, items }];
  return [{ title, items: [...items.slice(0, MAX_ITEMS), [{ text: `y ${items.length - MAX_ITEMS} más` }]] }];
}

/** One plain item per non-empty line of `text`. */
const lineItems = (text: string): Rich[] => text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => [{ text: line }]);

/** "<name> · " followed by the highlighted value. */
const withValue = (name: string, value: string): Rich => [{ text: `${name} · ` }, { text: value, highlight: true }];
const quantity = (item: { quantity: number; unit: string }) => `${formatQty(item.quantity)} ${item.unit}`.trim();

function mealTimes(db: AppDb, userId: string): Built {
  const plan = activePlan(db, userId);
  if (!plan?.current_version) return { lead: textLead(NO_PLAN_LEAD) };
  const meals = plan.current_version.structured_data.meals;
  const lead = meals.some((meal) => meal.time_window) ? "Estos son los horarios de tus comidas." : "Tu plan no tiene horarios para tus comidas.";
  const items = meals.map((meal): Rich => (meal.time_window ? withValue(meal.name, meal.time_window) : [{ text: meal.name }]));
  return { lead: textLead(lead), sections: section("Comidas", items), sources: [`Plan activo: ${plan.name}`] };
}

function planSummary(db: AppDb, userId: string, q: string): Built {
  const plan = activePlan(db, userId);
  if (!plan?.current_version) return { lead: textLead(NO_PLAN_LEAD) };
  const data = plan.current_version.structured_data;
  const sections = section("Comidas", data.meals.map((meal) => [{ text: meal.name }]));
  if (q.includes("suplement")) {
    const names = (data.supplements || []).map((item): Rich => [{ text: item.name }]);
    sections.push(...section("Suplementos", names.length ? names : [[{ text: "Sin suplementos registrados" }]]));
  }
  if (q.includes("recomend")) sections.push(...section("Recomendaciones", lineItems(data.recommendations || "")));
  return { lead: textLead(`Tu objetivo: ${data.objective}`), sections, sources: [`Plan activo: ${plan.name}`] };
}

function cartSummary(db: AppDb, userId: string): Built {
  const cart = consolidateCart(db, userId);
  if (!cart.ingredients.length) return { lead: textLead("Tu carrito está vacío.") };
  return {
    lead: textLead("Esto es lo que tienes en tu carrito."),
    sections: section("Ingredientes", cart.ingredients.map((item) => withValue(item.name, quantity(item)))),
    sources: ["Carrito actual"]
  };
}

// Question words that never narrow the recipe list: the stop words of the spec (REQ-1) and, via `isTopicWord`, the Topics vocabulary.
const STOP_WORDS = new Set(["que", "hay", "en", "mi", "mis", "de", "del", "el", "la", "los", "las", "con", "para", "por", "tengo", "cual", "cuales", "como", "cuanto", "es", "un", "una"]);

function recipeList(db: AppDb, userId: string, question: string): Built {
  const recipes = db.recipes.filter((item) => item.user_id === userId && !item.deleted_at);
  if (!recipes.length) return { lead: textLead("Aún no tienes recetas.") };
  const filter = words(question).filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !isTopicWord(word));
  const matching = recipes.filter((recipe) => words(recipe.name).some((word) => filter.includes(word)));
  const filtered = matching.length > 0;
  return {
    lead: textLead(filtered ? "Estas recetas coinciden con tu pregunta." : "Estas son tus recetas."),
    sections: section("Recetas", (filtered ? matching : recipes).map((item) => [{ text: item.name }])),
    sources: ["Recetario"]
  };
}

// Asked from a recipe's page: answer from that recipe, narrowing to the ingredients the question names.
function thisRecipe(db: AppDb, recipe: Recipe, q: string): Built {
  const details = recipeDetails(db, recipe);
  const named = details.ingredients.filter((item) => normalize(item.name).split(/\s+/).some((word) => word.length > 2 && q.includes(word)));
  const steps = recipe.description && !/^extraido de/.test(normalize(recipe.description)) ? lineItems(recipe.description) : [];
  const aboutPreparation = /prepar|como|cocin|paso|hace/.test(q);
  const sections: Section[] = [];
  if (named.length || !aboutPreparation || !steps.length) {
    sections.push(...section("Ingredientes", (named.length ? named : details.ingredients).map((item) => withValue(item.name, quantity(item)))));
  }
  if (steps.length && (aboutPreparation || !named.length)) sections.push(...section("Preparación", steps));
  return { lead: textLead(`Sobre ${recipe.name}:`), sections, sources: [`Receta: ${recipe.name}`] };
}

function build(db: AppDb, userId: string, topic: TopicId, scope: ScopeKey, recipe: Recipe | undefined, question: string): Built {
  if (topic === "mealTimes") return mealTimes(db, userId);
  if (topic === "plan") return planSummary(db, userId, normalize(question));
  if (topic === "cart") return cartSummary(db, userId);
  return scope === "Receta" && recipe ? thisRecipe(db, recipe, normalize(question)) : recipeList(db, userId, question);
}

// What a narrowed scope shows when no topic matches (REQ-20).
const OVERVIEW_TOPIC: Partial<Record<ScopeKey, TopicId>> = { "Plan activo": "plan", Recetario: "recipes", Carrito: "cart", Receta: "recipes" };

/**
 * Routing of the contract: a missing recipe first, then the winning topic, then the scope check, then an overview (narrowed
 * scope) or the unknown reply (Todo). `scopeInput` is the wire value as sent; it is echoed in `context_used`.
 */
export function ragAnswer(db: AppDb, userId: string, question: string, scopeInput = "auto", recipeId?: string): ChatAnswer {
  const scope = toScopeKey(scopeInput);
  const fixed = (kind: "unknown" | "out_of_scope" | "missing_recipe") => reply(scopeInput, { kind, lead: textLead(UNKNOWN_LEAD), body: CAPABILITY_LINE });

  const recipe = recipeId ? db.recipes.find((item) => item.id === recipeId && item.user_id === userId && !item.deleted_at) : undefined;
  if (scope === "Receta" && !recipe) return fixed("missing_recipe");

  const winner = matchTopic(question);
  const topic = winner ?? OVERVIEW_TOPIC[scope];
  if (winner && !answersIn(winner, scope)) return fixed("out_of_scope");
  if (!topic) return fixed("unknown");

  const built = build(db, userId, topic, scope, recipe, question);
  return reply(scopeInput, { kind: winner ? "answer" : "overview", ...built, follow_ups: followUpsFor(topic, scope) });
}
