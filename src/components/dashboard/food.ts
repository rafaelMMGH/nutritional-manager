export type Ingredient = { name: string; quantity: number; unit: string; category: string };

export type Meal = {
  id: string;
  name: string;
  display_order: number;
  time_window: string;
  options_count: number;
  equivalents?: Record<string, number> | null;
  recipe: { id: string; name: string; ingredients: Ingredient[] } | null;
};

export type DayLog = { meals_done: string[]; water_glasses: number; weight_kg?: number | null; exercised?: boolean };

export const WATER_GOAL_LITERS = 2;
export const WATER_GLASS_LITERS = 0.25;

export function normalize(value = "") {
  return String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

// The PDF extractor currently produces byte noise for many names; only show names that read like words.
export function isReadableName(name: string) {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 60) return false;
  if (/[{}[\]|\\@#$%^*_~<>=+`"]/.test(text)) return false;
  const words = text.split(" ");
  if (words.some((word) => /\d/.test(word) && /\p{L}/u.test(word))) return false;
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters / text.replace(/\s/g, "").length < 0.8) return false;
  const wordish = words.filter((word) => /^[\p{L}'’.-]{2,}$/u.test(word));
  return wordish.length / words.length >= 0.6 && /[aeiouáéíóú]/i.test(text);
}

const ICON_KEYWORDS: [string[], string][] = [
  [["salchicha", "hot dog"], "hot-dog"],
  [["jamon"], "meat"],
  [["pollo", "pechuga", "pavo"], "poultry"],
  [["huevo", "clara"], "egg"],
  [["atun", "pescado", "salmon", "tilapia", "sardina"], "fish"],
  [["camaron"], "shrimp"],
  [["carne", "res", "bistec", "cerdo", "lomo", "molida", "chuleta"], "meat"],
  [["queso", "requeson"], "cheese"],
  [["yogurt", "yogur", "avena", "granola", "cereal"], "bowl-spoon"],
  [["leche", "yakult", "kefir"], "milk"],
  [["arroz"], "rice"],
  [["tortilla", "tostada"], "flatbread"],
  [["galleta"], "cookie"],
  [["pan", "bolillo", "telera"], "bread"],
  [["pasta", "espagueti", "fideo"], "spaghetti"],
  [["elote", "maiz"], "corn"],
  [["sandia", "melon", "papaya"], "watermelon"],
  [["papa", "camote"], "potato"],
  [["frijol", "lenteja", "garbanzo"], "beans"],
  [["manzana"], "apple"],
  [["platano"], "banana"],
  [["fresa", "berries", "frutos rojos", "zarzamora", "arandano"], "strawberry"],
  [["naranja", "mandarina", "toronja"], "tangerine"],
  [["uva"], "grapes"],
  [["pina"], "pineapple"],
  [["mango"], "mango"],
  [["aguacate"], "avocado"],
  [["jitomate", "tomate", "catsup"], "tomato"],
  [["brocoli", "coliflor"], "broccoli"],
  [["zanahoria"], "carrot"],
  [["pepino", "calabaza", "calabacita", "chayote"], "cucumber"],
  [["cebolla"], "onion"],
  [["chile"], "hot-pepper"],
  [["ajo"], "garlic"],
  [["lechuga", "espinaca", "acelga", "verdura", "ensalada", "nopal", "cilantro"], "leafy-green"],
  [["nuez", "almendra", "cacahuate", "pistache", "semilla"], "peanuts"],
  [["chocolate", "cacao"], "chocolate"],
  [["aceite"], "olive"],
  [["crema", "mantequilla", "mayonesa"], "butter"],
  [["azucar", "miel"], "honey"],
  [["sal\\b", "pimienta", "condimento"], "salt"],
  [["cafe", "te\\b"], "coffee"],
  [["licuado", "smoothie", "jugo", "agua de frutas"], "cup-straw"],
  [["agua"], "droplet"],
  [["proteina", "creatina", "suplemento", "whey"], "pill"],
  [["limon"], "lemon"]
];

const CATEGORY_ICONS: Record<string, string> = {
  proteinas: "poultry",
  lacteos: "milk",
  "cereales / tortillas / pan": "flatbread",
  frutas: "apple",
  verduras: "leafy-green",
  leguminosas: "beans",
  grasas: "olive",
  azucares: "honey",
  condimentos: "salt",
  bebidas: "cup-straw",
  suplementos: "pill"
};

export function foodIcon(name: string, category = "") {
  if (isReadableName(name)) {
    const key = normalize(name);
    const hit = ICON_KEYWORDS.find(([terms]) => terms.some((term) => new RegExp(`\\b${term}`).test(key)));
    if (hit) return `/food/${hit[1]}.png`;
  }
  return `/food/${CATEGORY_ICONS[normalize(category)] || "plate"}.png`;
}

const MEAL_STYLES: Record<string, { icon: string; tone: string }> = {
  "pre-entreno": { icon: "banana", tone: "teal" },
  desayuno: { icon: "cooking", tone: "coral" },
  colacion: { icon: "bowl-spoon", tone: "green" },
  comida: { icon: "pot-food", tone: "orange" },
  cena: { icon: "green-salad", tone: "blue" }
};

export function mealStyle(name: string) {
  return MEAL_STYLES[normalize(name)] || { icon: "plate", tone: "blue" };
}

export function mealLabel(name: string) {
  const labels: Record<string, string> = { colacion: "Colación", "pre-entreno": "Pre-entreno" };
  return labels[normalize(name)] || name;
}

const DEFAULT_TIMES: Record<string, string> = { "pre-entreno": "06:30", desayuno: "08:00", comida: "14:30", cena: "20:00" };

// Typical times until the user sets their own; a second colación of the day goes in the afternoon.
export function mealTime(meal: Meal, meals: Meal[]) {
  if (meal.time_window) return meal.time_window;
  const key = normalize(meal.name);
  if (key !== "colacion") return DEFAULT_TIMES[key] || "12:00";
  const lunch = meals.find((item) => normalize(item.name) === "comida");
  return lunch && meal.display_order > lunch.display_order ? "17:30" : "11:00";
}

export function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

// The option's dish title from the PDF ("Molletes con jamón y pollo"), else a name built from its ingredients.
export function mealTitle(meal: Meal) {
  const name = meal.recipe?.name?.trim() ?? "";
  if (name && !/opci[oó]n\s*\d+$/i.test(name)) return name;
  return dishName(meal.recipe?.ingredients ?? []) || mealLabel(meal.name);
}

export function dishName(ingredients: Ingredient[]) {
  const names = ingredients.filter((item) => isReadableName(item.name)).map((item) => item.name.trim().toLowerCase());
  const unique = [...new Set(names)].slice(0, 3);
  if (!unique.length) return "";
  const text = unique.length > 1 ? `${unique.slice(0, -1).join(", ")} y ${unique.at(-1)}` : unique[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

const FRACTIONS: [number, string][] = [[1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"]];

// 0.333 taza -> "⅓ taza", 1.5 -> "1 ½"; other decimals keep up to two digits.
export function qty(value: number) {
  const amount = Number(value || 0);
  const whole = Math.floor(amount);
  const glyph = FRACTIONS.find(([fraction]) => Math.abs(amount - whole - fraction) < 0.02)?.[1];
  if (glyph) return whole ? `${whole} ${glyph}` : glyph;
  return amount.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

const FOOD_GROUPS: Record<string, { label: string; short: string; color: string; icon: string }> = {
  proteinas: { label: "Proteínas", short: "Prot.", color: "#f59e0b", icon: "poultry" },
  "cereales / tortillas / pan": { label: "Cereales", short: "Cereal", color: "#8b6cf0", icon: "flatbread" },
  frutas: { label: "Frutas", short: "Fruta", color: "#ef5b73", icon: "apple" },
  verduras: { label: "Verduras", short: "Verd.", color: "#34a853", icon: "leafy-green" },
  lacteos: { label: "Lácteos", short: "Lácteo", color: "#2180e6", icon: "milk" },
  leguminosas: { label: "Leguminosas", short: "Legum.", color: "#b45309", icon: "beans" },
  grasas: { label: "Grasas", short: "Grasa", color: "#65a30d", icon: "avocado" },
  suplementos: { label: "Suplementos", short: "Supl.", color: "#14b8a6", icon: "pill" }
};

// Nutritionist "equivalentes" per food group (SMAE), as printed in the plan's table.
const EQUIVALENT_GROUPS: Record<string, { short: string; color: string; icon: string }> = {
  Verduras: { short: "Verd.", color: "#34a853", icon: "leafy-green" },
  Frutas: { short: "Fruta", color: "#ef5b73", icon: "apple" },
  Cereales: { short: "Cereal", color: "#8b6cf0", icon: "flatbread" },
  AOA: { short: "AOA", color: "#f59e0b", icon: "poultry" },
  Leche: { short: "Leche", color: "#2180e6", icon: "milk" },
  "Aceites y grasas": { short: "Grasa", color: "#65a30d", icon: "avocado" },
  Leguminosas: { short: "Legum.", color: "#b45309", icon: "beans" },
  Azúcares: { short: "Azúcar", color: "#db2777", icon: "honey" }
};

export function equivalentGroup(name: string) {
  const group = EQUIVALENT_GROUPS[name];
  return group ? { key: name, label: name === "AOA" ? "Alimentos de origen animal" : name, ...group } : null;
}

export function foodGroup(category: string) {
  const key = normalize(category);
  const group = FOOD_GROUPS[key];
  return group ? { key, ...group } : null;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, amount: number) {
  const date = parseKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}
