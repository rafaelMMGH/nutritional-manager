import type { AppDb, Recipe } from "@/lib/types";
import { type ChatAnswer, type FollowUp, type ReplyKind, type Rich, type ScopeKey, type Section, toScopeKey } from "@/lib/assistant";
import { consolidateCart } from "@/lib/domain/cart";
import { answersIn, followUpsFor, matchTopic, type TopicId } from "@/lib/domain/chat-topics";
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

// Per-topic text of the answer. Until the structured builders land, each topic answers with its text as a one-span lead.
type Content = { text: string; sources: string[] };

function mealTimesContent(db: AppDb, userId: string): Content {
  const plan = activePlan(db, userId);
  if (!plan?.current_version) return { text: "No tienes un plan activo.", sources: [] };
  const meals = plan.current_version.structured_data.meals.map((meal) => `${meal.name}${meal.time_window ? ` · ${meal.time_window}` : ""}`);
  return { text: `Comidas: ${meals.join("; ")}`, sources: [`Plan activo: ${plan.name}`] };
}

function planContent(db: AppDb, userId: string, q: string): Content {
  const plan = activePlan(db, userId);
  if (!plan?.current_version) return { text: "No tienes un plan activo.", sources: [] };
  const data = plan.current_version.structured_data;
  const snippets = [`Objetivo: ${data.objective}`, `Comidas: ${data.meals.map((meal) => meal.name).join(", ")}`];
  if (q.includes("suplement")) snippets.push(`Suplementos: ${(data.supplements || []).map((item) => item.name).join(", ") || "sin suplementos encontrados"}`);
  if (q.includes("recomend")) snippets.push(`Recomendaciones: ${data.recommendations}`);
  return { text: snippets.join("\n"), sources: [`Plan activo: ${plan.name}`] };
}

function cartContent(db: AppDb, userId: string): Content {
  const cart = consolidateCart(db, userId);
  if (!cart.ingredients.length) return { text: "Tu carrito está vacío.", sources: [] };
  return { text: `Ingredientes en carrito: ${cart.ingredients.map((item) => `${item.name} ${formatQty(item.quantity)} ${item.unit}`.trim()).join("; ")}`, sources: ["Carrito actual"] };
}

function recipeListContent(db: AppDb, userId: string): Content {
  const recipes = db.recipes.filter((item) => item.user_id === userId && !item.deleted_at);
  if (!recipes.length) return { text: "Aún no tienes recetas.", sources: [] };
  return { text: `Recetas disponibles: ${recipes.slice(0, 8).map((item) => item.name).join(", ")}`, sources: ["Recetario"] };
}

// Asked from a recipe's page: answer from that recipe, narrowing to the ingredients the question names.
function thisRecipeContent(db: AppDb, recipe: Recipe, q: string): Content {
  const details = recipeDetails(db, recipe);
  const named = details.ingredients.filter((item) => normalize(item.name).split(/\s+/).some((word) => word.length > 2 && q.includes(word)));
  const list = (named.length ? named : details.ingredients).map((item) => `${item.name} ${formatQty(item.quantity)} ${item.unit}`.trim());
  const instructions = recipe.description && !/^extraido de/.test(normalize(recipe.description)) ? recipe.description : "";
  const aboutPreparation = /prepar|como|cocin|paso|hace/.test(q);
  const snippets: string[] = [];
  if (named.length || !aboutPreparation || !instructions) snippets.push(`${named.length ? "En" : "Ingredientes de"} ${recipe.name}: ${list.join("; ")}`);
  if (instructions && (aboutPreparation || !named.length)) snippets.push(`Preparación: ${instructions}`);
  return { text: snippets.join("\n"), sources: [`Receta: ${recipe.name}`] };
}

function contentFor(db: AppDb, userId: string, topic: TopicId, scope: ScopeKey, recipe: Recipe | undefined, q: string): Content {
  if (topic === "mealTimes") return mealTimesContent(db, userId);
  if (topic === "plan") return planContent(db, userId, q);
  if (topic === "cart") return cartContent(db, userId);
  return scope === "Receta" && recipe ? thisRecipeContent(db, recipe, q) : recipeListContent(db, userId);
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

  const q = normalize(question);
  const winner = matchTopic(question);
  const topic = winner ?? OVERVIEW_TOPIC[scope];
  if (winner && !answersIn(winner, scope)) return fixed("out_of_scope");
  if (!topic) return fixed("unknown");

  const { text, sources } = contentFor(db, userId, topic, scope, recipe, q);
  return reply(scopeInput, { kind: winner ? "answer" : "overview", lead: textLead(text), sources, follow_ups: followUpsFor(topic, scope) });
}
