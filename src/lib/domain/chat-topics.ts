import { type FollowUp, type ScopeKey, words } from "@/lib/assistant";

// Topic matcher of the assistant (spec assistant-chat-polish, REQ-19). A question has at most one winning topic, found
// from its words against the vocabulary below only. The vocabulary is exhaustive: do not add words the spec's Topics
// table does not list.

export type TopicId = "mealTimes" | "cart" | "recipes" | "plan";
type Tier = 1 | 2 | 3;

type Vocabulary = { tier: Tier; topic: TopicId; exact: string[]; stems: string[] };

const MEAL_NOUNS = ["desayuno", "desayunos", "comida", "comidas", "cena", "cenas", "colacion", "colaciones"];

// Normalized (lowercase, no accents). A word matches if it equals an `exact` entry or starts with a stem.
const VOCABULARY: Vocabulary[] = [
  { tier: 1, topic: "mealTimes", exact: ["hora", "horas", "horario", "horarios"], stems: [] },
  { tier: 3, topic: "mealTimes", exact: MEAL_NOUNS, stems: [] },
  { tier: 2, topic: "cart", exact: ["carrito", "carritos"], stems: ["compr"] },
  { tier: 2, topic: "recipes", exact: [], stems: ["receta", "ingrediente", "prepar"] },
  { tier: 2, topic: "plan", exact: ["plan", "planes", "objetivo", "objetivos"], stems: ["suplement", "recomend"] }
];

// "cuándo" is a weak Tier 1 word (REQ-19): it counts only next to a meal noun or when nothing else is a topic word.
const WHEN = "cuando";

// Ties inside a tier go to the first topic of this list.
const TIE_ORDER: TopicId[] = ["cart", "recipes", "plan", "mealTimes"];

/** Topics that answer a question in each scope ("Answers in" of the Topics table). */
const ANSWERED_IN: Record<TopicId, ScopeKey[]> = {
  mealTimes: ["auto", "Plan activo"],
  cart: ["auto", "Carrito"],
  recipes: ["auto", "Recetario", "Receta"],
  plan: ["auto", "Plan activo"]
};

export function answersIn(topic: TopicId, scope: ScopeKey): boolean {
  return ANSWERED_IN[topic].includes(scope);
}

const fu = (text: string, scope: ScopeKey): FollowUp => ({ text, scope });

const FOLLOW_UPS: Record<"mealTimes" | "cart" | "recipeList" | "thisRecipe" | "plan", FollowUp[]> = {
  mealTimes: [fu("¿Qué recetas hay en mi plan?", "Recetario"), fu("¿Qué hay en mi carrito?", "Carrito"), fu("¿Cuál es mi objetivo?", "Plan activo")],
  cart: [fu("¿Qué recetas hay en mi plan?", "Recetario"), fu("¿A qué hora es mi comida?", "Plan activo")],
  recipeList: [fu("¿Qué hay en mi carrito?", "Carrito"), fu("¿A qué hora es mi comida?", "Plan activo")],
  thisRecipe: [fu("¿Qué ingredientes lleva?", "Receta"), fu("¿Cómo se prepara?", "Receta"), fu("¿Qué hay en mi carrito?", "Carrito")],
  plan: [fu("¿A qué hora es mi comida?", "Plan activo"), fu("¿Qué suplementos tomo?", "Plan activo"), fu("¿Qué recetas hay en mi plan?", "Recetario")]
};

/** The topic's full follow-up list, unfiltered. The recipes topic has two: the recipe list, and "this recipe" in scope Receta. */
export function followUpsFor(topic: TopicId, scope: ScopeKey): FollowUp[] {
  if (topic === "recipes") return FOLLOW_UPS[scope === "Receta" ? "thisRecipe" : "recipeList"];
  return FOLLOW_UPS[topic];
}

/** Tiers of the topics a (normalized) word belongs to. */
function classify(word: string): { tier: Tier; topic: TopicId }[] {
  return VOCABULARY.filter((entry) => entry.exact.includes(word) || entry.stems.some((stem) => word.startsWith(stem))).map(({ tier, topic }) => ({ tier, topic }));
}

/** True when a normalized word is in the vocabulary (including "cuando"): the recipe-list filter drops such words. */
export function isTopicWord(word: string): boolean {
  return word === WHEN || classify(word).length > 0;
}

/** The winning topic of a question, or null when no word is a topic word. Tier 1 beats 2 beats 3; ties follow `TIE_ORDER`. */
export function matchTopic(question: string): TopicId | null {
  const tokens = words(question);
  const hits = tokens.flatMap(classify);
  const hasMealNoun = tokens.some((word) => MEAL_NOUNS.includes(word));
  if (tokens.includes(WHEN) && (hasMealNoun || hits.length === 0)) hits.push({ tier: 1, topic: "mealTimes" });
  for (const tier of [1, 2, 3] as const) {
    const topics = hits.filter((hit) => hit.tier === tier).map((hit) => hit.topic);
    const winner = TIE_ORDER.find((topic) => topics.includes(topic));
    if (winner) return winner;
  }
  return null;
}
