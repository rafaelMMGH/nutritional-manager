import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STORAGE_DIR = path.join(DATA_DIR, "private-pdfs");
const DB_PATH = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3000);

const now = () => new Date().toISOString();
const id = () => randomUUID();

const categories = {
  pollo: "Proteinas",
  atun: "Proteinas",
  huevo: "Proteinas",
  salmon: "Proteinas",
  carne: "Proteinas",
  yogurt: "Lacteos",
  leche: "Lacteos",
  queso: "Lacteos",
  arroz: "Cereales / tortillas / pan",
  tortilla: "Cereales / tortillas / pan",
  pan: "Cereales / tortillas / pan",
  avena: "Cereales / tortillas / pan",
  platano: "Frutas",
  manzana: "Frutas",
  berries: "Frutas",
  lechuga: "Verduras",
  tomate: "Verduras",
  jitomate: "Verduras",
  espinaca: "Verduras",
  pepino: "Verduras",
  proteina: "Suplementos",
  creatina: "Suplementos"
};

const emptyDb = () => ({
  users: [{ id: "demo-user", email: "demo@nutritional.local", name: "Demo User", created_at: now(), updated_at: now(), deleted_at: null }],
  sessions: {},
  plans: [],
  planVersions: [],
  uploadedPdfs: [],
  mealTypes: [],
  mealOptions: [],
  recipes: [],
  planVersionRecipes: [],
  sharedAddOns: [],
  ingredients: [],
  ingredientAliases: [],
  ingredientUsages: [],
  alternativeGroups: [],
  carts: [{ id: "demo-cart", user_id: "demo-user", status: "active", created_at: now(), updated_at: now(), deleted_at: null }],
  cartItems: [],
  shoppingLists: [],
  shoppingListItems: [],
  shoppingTemplates: [],
  ragIndexes: [],
  auditEvents: [],
  settings: {
    alGustoDefaults: {
      tomate: { quantity: 1, unit: "pieza" },
      cebolla: { quantity: 0.25, unit: "pieza" },
      "chile serrano": { quantity: 1, unit: "pieza" },
      cilantro: { quantity: 1, unit: "manojo" }
    },
    excludedAlGusto: ["sal", "condimentos", "especias", "limon", "jugo de limon"]
  }
});

async function ensureDb() {
  await mkdir(STORAGE_DIR, { recursive: true });
  if (!existsSync(DB_PATH)) await writeJson(DB_PATH, emptyDb());
}

async function readDb() {
  await ensureDb();
  return JSON.parse(await readFile(DB_PATH, "utf8"));
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
}

async function saveDb(db) {
  await writeJson(DB_PATH, db);
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

function sendJson(res, body, status = 200) {
  send(res, status, body, { "Cache-Control": "no-store" });
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((pair) => {
    const [key, ...rest] = pair.trim().split("=");
    return [key, decodeURIComponent(rest.join("="))];
  }));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const type = req.headers["content-type"] || "";
  if (type.includes("application/json")) return JSON.parse(buffer.toString("utf8") || "{}");
  return buffer;
}

async function requireUser(req, res) {
  const db = await readDb();
  const token = parseCookies(req).nm_session;
  const userId = token && db.sessions[token];
  const user = db.users.find((item) => item.id === userId && !item.deleted_at);
  if (!user) {
    sendJson(res, { error: "Authentication required" }, 401);
    return null;
  }
  return { db, user };
}

function normalize(value = "") {
  return String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function categoryFor(name) {
  const key = normalize(name);
  const hit = Object.entries(categories).find(([term]) => key.includes(term));
  return hit ? hit[1] : "Otros";
}

function canonicalHash(recipe) {
  const parts = recipe.ingredients
    .map((item) => `${normalize(item.name)}:${item.quantity || ""}:${normalize(item.unit || "")}`)
    .sort()
    .join("|");
  return createHash("sha256").update(parts).digest("hex");
}

function parseQuantity(raw) {
  if (!raw) return null;
  const value = raw.replace(",", ".").trim();
  if (value.includes("/")) {
    const [a, b] = value.split("/").map(Number);
    return b ? a / b : Number(value);
  }
  return Number(value);
}

function parseIngredients(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const unitPattern = "piezas|pieza|tazas|taza|scoops|scoop|rebanada|cucharadita|paquete|sobre|lata|kg|gr|g|ml|l";
  const ingredientLines = lines.filter((line) => new RegExp(`(\\d+([.,]\\d+)?|\\d+\\/\\d+)\\s*(${unitPattern})`, "i").test(line));
  const source = ingredientLines.length ? ingredientLines : [
    "120 g pollo",
    "80 g arroz",
    "1 taza verduras",
    "1 pieza manzana"
  ];
  return source.slice(0, 8).map((line, index) => {
    const alternatives = line.split(/\s+o\s+/i).map((part) => part.trim());
    return alternatives.map((part, altIndex) => {
      const match = part.match(new RegExp(`(\\d+(?:[.,]\\d+)?|\\d+\\/\\d+)\\s*(${unitPattern})\\s*(?:de\\s+)?(.+)`, "i"));
      const quantity = parseQuantity(match?.[1]) || (index + 1);
      const unit = (match?.[2] || "pieza").replace(/^gr$/i, "g");
      const name = (match?.[3] || part).replace(/[().]/g, "").trim();
      return {
        name,
        quantity,
        unit,
        category: categoryFor(name),
        confidence_score: ingredientLines.length ? 0.82 : 0.45,
        requires_review: !ingredientLines.length || altIndex > 0
      };
    });
  });
}

function extractPlan(buffer, fileName) {
  const raw = buffer.toString("latin1");
  const text = raw.replace(/[^\x09\x0A\x0D\x20-\x7EÁÉÍÓÚáéíóúÑñ]/g, " ");
  const mealNames = ["Pre-entreno", "Desayuno", "Colacion", "Comida", "Cena"];
  const discovered = mealNames.filter((meal) => new RegExp(meal, "i").test(text));
  const selectedMeals = discovered.length ? discovered : mealNames.slice(1);
  const positions = selectedMeals
    .map((meal) => ({ meal, index: text.search(new RegExp(meal, "i")) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  const meals = selectedMeals.map((meal, idx) => {
    const current = positions.find((item) => item.meal === meal);
    const next = positions.find((item) => item.index > (current?.index ?? -1));
    const section = current ? text.slice(current.index, next?.index ?? current.index + 1400) : text.slice(idx * 900, idx * 900 + 1400);
    const ingredients = parseIngredients(section);
    return {
      name: meal,
      time_window: "",
      options: [
        {
          option_number: 1,
          recipe: {
            name: `${meal} opcion 1`,
            description: `Extraido de ${fileName}`,
            ingredients: ingredients.map((group) => group[0]),
            alternatives: ingredients.filter((group) => group.length > 1)
          },
          confidence_score: ingredients.some((group) => group[0].requires_review) ? 0.55 : 0.82,
          requires_review: ingredients.some((group) => group[0].requires_review)
        }
      ],
      add_ons: idx === 0 ? [{ name: "Agua natural", required: false, ingredients: [{ name: "agua", quantity: 1, unit: "L", category: "Otros" }] }] : []
    };
  });
  return {
    name: fileName.replace(/\.pdf$/i, ""),
    objective: /volumen|masa/i.test(text) ? "Aumento de masa muscular" : /definicion|perdida|bajar/i.test(text) ? "Perdida de grasa" : "Pendiente de revisar",
    diagnosis: "",
    recommendations: text.match(/recomendaciones?(.{0,500})/i)?.[1]?.trim() || "No encontré recomendaciones estructuradas en el PDF.",
    supplements: /creatina/i.test(text) ? [{ name: "Creatina", quantity: 1, unit: "scoop" }] : [],
    nutrition_summary: {},
    meals
  };
}

function materializePlan(db, userId, plan, structuredData, pdf) {
  db.plans.filter((item) => item.id !== plan.id && item.user_id === userId && item.status === "active" && !item.deleted_at).forEach((item) => {
    item.status = "archived";
    item.updated_at = now();
  });
  const planVersion = { id: id(), plan_id: plan.id, version_number: 1, structured_data: structuredData, change_summary: "Version inicial extraida del PDF", is_current: true, created_at: now(), updated_at: now(), deleted_at: null };
  db.planVersions.push(planVersion);
  db.uploadedPdfs.push(pdf);
  structuredData.meals.forEach((meal, mealIndex) => {
    const mealType = { id: id(), plan_version_id: planVersion.id, name: meal.name, display_order: mealIndex + 1, time_window: meal.time_window || "", created_at: now(), deleted_at: null };
    db.mealTypes.push(mealType);
    meal.options.forEach((option) => {
      const hash = canonicalHash(option.recipe);
      let recipe = db.recipes.find((item) => item.user_id === userId && item.canonical_hash === hash && !item.deleted_at);
      if (!recipe) {
        recipe = { id: id(), user_id: userId, name: option.recipe.name, description: option.recipe.description || "", canonical_hash: hash, created_at: now(), updated_at: now(), deleted_at: null };
        db.recipes.push(recipe);
        option.recipe.ingredients.forEach((ingredient) => ensureIngredientUsage(db, userId, ingredient, "recipe", recipe.id));
      }
      db.planVersionRecipes.push({ id: id(), plan_version_id: planVersion.id, recipe_id: recipe.id, meal_type_id: mealType.id, option_number: option.option_number, created_at: now(), deleted_at: null });
      db.mealOptions.push({ id: id(), plan_version_id: planVersion.id, meal_type_id: mealType.id, recipe_id: recipe.id, option_number: option.option_number, is_unique_option: meal.options.length === 1, created_at: now(), deleted_at: null });
    });
    meal.add_ons?.forEach((addon) => db.sharedAddOns.push({ id: id(), plan_version_id: planVersion.id, meal_type_id: mealType.id, name: addon.name, applies_to_all_options: true, canonical_hash: canonicalHash({ ingredients: addon.ingredients || [] }), created_at: now(), deleted_at: null }));
  });
  db.ragIndexes.push({ id: id(), user_id: userId, scope_type: "plan_version", scope_id: planVersion.id, status: "ready", index_metadata: { chunks: structuredData.meals.length }, created_at: now(), updated_at: now(), deleted_at: null });
  return planVersion;
}

function ensureIngredientUsage(db, userId, ingredient, sourceType, sourceId) {
  let canonical = db.ingredients.find((item) => item.user_id === userId && normalize(item.canonical_name) === normalize(ingredient.name) && !item.deleted_at);
  if (!canonical) {
    canonical = { id: id(), user_id: userId, canonical_name: ingredient.name, category: ingredient.category || categoryFor(ingredient.name), primary_unit: ingredient.unit || "", created_at: now(), updated_at: now(), deleted_at: null };
    db.ingredients.push(canonical);
  }
  const usage = { id: id(), ingredient_id: canonical.id, source_type: sourceType, source_id: sourceId, quantity: ingredient.quantity, unit: ingredient.unit, practical_quantity: ingredient.practical_quantity || null, practical_unit: ingredient.practical_unit || null, notes: ingredient.notes || "", is_optional: Boolean(ingredient.is_optional), alternative_group_id: ingredient.alternative_group_id || null, confidence_score: ingredient.confidence_score ?? 0.8, requires_review: Boolean(ingredient.requires_review), created_at: now(), deleted_at: null };
  db.ingredientUsages.push(usage);
  return usage;
}

function activePlan(db, userId) {
  const plan = db.plans.find((item) => item.user_id === userId && item.status === "active" && !item.deleted_at);
  if (!plan) return null;
  const version = db.planVersions.find((item) => item.plan_id === plan.id && item.is_current && !item.deleted_at);
  return { ...plan, current_version: version };
}

function recipeDetails(db, recipe) {
  const usages = db.ingredientUsages.filter((usage) => usage.source_type === "recipe" && usage.source_id === recipe.id && !usage.deleted_at);
  const ingredients = usages.map((usage) => {
    const ingredient = db.ingredients.find((item) => item.id === usage.ingredient_id);
    return { ...usage, name: ingredient?.canonical_name || usage.name_snapshot, category: ingredient?.category || "Otros" };
  });
  const appearances = db.planVersionRecipes.filter((link) => link.recipe_id === recipe.id && !link.deleted_at).map((link) => {
    const version = db.planVersions.find((item) => item.id === link.plan_version_id);
    const plan = version && db.plans.find((item) => item.id === version.plan_id);
    const meal = db.mealTypes.find((item) => item.id === link.meal_type_id);
    return { plan_id: plan?.id, plan_name: plan?.name, plan_status: plan?.status, version_number: version?.version_number, meal_type: meal?.name, option_number: link.option_number };
  });
  return { ...recipe, ingredients, appearances };
}

function consolidateCart(db, userId) {
  const cart = db.carts.find((item) => item.user_id === userId && item.status === "active" && !item.deleted_at);
  const items = db.cartItems.filter((item) => item.cart_id === cart?.id && !item.deleted_at);
  const bucket = new Map();
  const sources = [];
  for (const item of items) {
    let usages = [];
    let sourceName = item.source_type;
    if (item.source_type === "recipe") {
      const recipe = db.recipes.find((entry) => entry.id === item.source_id);
      sourceName = recipe?.name || sourceName;
      usages = db.ingredientUsages.filter((usage) => usage.source_type === "recipe" && usage.source_id === item.source_id && !usage.deleted_at);
    } else if (item.source_type === "manual") {
      usages = [{ ingredient_id: item.manual_ingredient_id, quantity: item.manual_quantity, unit: item.manual_unit, source_type: "manual", source_id: item.id }];
      sourceName = item.manual_name;
    } else if (item.source_type === "shopping_list") {
      const listItems = db.shoppingListItems.filter((entry) => entry.shopping_list_id === item.source_id && !entry.deleted_at);
      usages = listItems.map((entry) => ({ ingredient_id: entry.ingredient_id, quantity: entry.quantity_snapshot, unit: entry.unit_snapshot, source_type: "shopping_list", source_id: item.source_id, name_snapshot: entry.name_snapshot, category_snapshot: entry.category_snapshot }));
      sourceName = db.shoppingLists.find((entry) => entry.id === item.source_id)?.name || sourceName;
    }
    sources.push({ ...item, source_name: sourceName });
    for (const usage of usages) {
      const ingredient = db.ingredients.find((entry) => entry.id === usage.ingredient_id);
      const name = ingredient?.canonical_name || usage.name_snapshot || item.manual_name || "Ingrediente";
      const category = ingredient?.category || usage.category_snapshot || categoryFor(name);
      const unit = usage.practical_unit || usage.unit || "";
      const quantity = Number(usage.practical_quantity || usage.quantity || 1) * Number(item.quantity_multiplier || item.period_days || 1);
      const key = `${normalize(name)}|${unit}`;
      const current = bucket.get(key) || { name, category, unit, quantity: 0, sources: [] };
      current.quantity += quantity;
      current.sources.push({ source_name: sourceName, quantity, unit });
      bucket.set(key, current);
    }
  }
  return { cart, sources, ingredients: Array.from(bucket.values()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) };
}

function ragAnswer(db, userId, question, scope = "auto") {
  const q = normalize(question);
  const context = scope === "auto" ? "Todo el sistema" : scope;
  const sources = [];
  const snippets = [];
  const plan = activePlan(db, userId);
  if (plan?.current_version && (scope === "auto" || scope.includes("plan") || q.includes("plan"))) {
    const data = plan.current_version.structured_data;
    sources.push(`Plan activo: ${plan.name}`);
    snippets.push(`Objetivo: ${data.objective}`);
    snippets.push(`Comidas: ${data.meals.map((meal) => meal.name).join(", ")}`);
    if (q.includes("suplement")) snippets.push(`Suplementos: ${(data.supplements || []).map((item) => item.name).join(", ") || "sin suplementos encontrados"}`);
    if (q.includes("recomend")) snippets.push(`Recomendaciones: ${data.recommendations}`);
  }
  if (scope === "auto" || scope.includes("carrito") || q.includes("carrito") || q.includes("compr")) {
    const cart = consolidateCart(db, userId);
    if (cart.ingredients.length) {
      sources.push("Carrito actual");
      snippets.push(`Ingredientes en carrito: ${cart.ingredients.map((item) => `${item.name} ${formatQty(item.quantity)} ${item.unit}`.trim()).join("; ")}`);
    }
  }
  if (scope === "auto" || scope.includes("recetario") || q.includes("receta")) {
    const recipes = db.recipes.filter((item) => item.user_id === userId && !item.deleted_at);
    const matches = recipes.filter((item) => normalize(item.name).includes(q.split(" ")[0] || ""));
    if (recipes.length) {
      sources.push("Recetario");
      snippets.push(`Recetas disponibles: ${(matches.length ? matches : recipes).slice(0, 8).map((item) => item.name).join(", ")}`);
    }
  }
  if (!snippets.length) return { answer: scope === "Plan activo" ? "No encontré esa información en tu plan activo." : "No encontré esa información en el sistema.", context_used: context, sources: [] };
  return { answer: snippets.join("\n"), context_used: context, sources };
}

function formatQty(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
}

function exportList(db, list, format) {
  const items = db.shoppingListItems.filter((item) => item.shopping_list_id === list.id && !item.deleted_at);
  if (format === "json") return JSON.stringify({ ...list, items }, null, 2);
  if (format === "markdown") {
    return [`# ${list.name}`, "", ...items.map((item) => `- [${item.status === "Comprado" ? "x" : " "}] ${item.name_snapshot}: ${formatQty(item.quantity_snapshot)} ${item.unit_snapshot} (${item.category_snapshot})`)].join("\n");
  }
  return [`${list.name}`, ...items.map((item) => `${item.status} - ${item.name_snapshot}: ${formatQty(item.quantity_snapshot)} ${item.unit_snapshot}`)].join("\n");
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const db = await readDb();
    const user = db.users[0];
    user.email = body.email || user.email;
    user.name = body.name || user.name;
    user.updated_at = now();
    const token = id();
    db.sessions[token] = user.id;
    res.setHeader("Set-Cookie", `nm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/`);
    await saveDb(db);
    sendJson(res, { user }, 200);
    return;
  }
  if (pathname === "/api/auth/me") {
    const auth = await requireUser(req, res);
    if (auth) sendJson(res, { user: auth.user });
    return;
  }
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { db, user } = auth;

  if (pathname === "/api/dashboard") {
    const cart = consolidateCart(db, user.id);
    const lists = db.shoppingLists.filter((item) => item.user_id === user.id && !item.deleted_at);
    const recipes = db.recipes.filter((item) => item.user_id === user.id && !item.deleted_at);
    sendJson(res, { activePlan: activePlan(db, user.id), cartCount: cart.sources.length, cartIngredients: cart.ingredients.length, lastList: lists.at(-1) || null, listsCount: lists.length, recipesCount: recipes.length, plannedDays: cart.sources.reduce((sum, item) => sum + Number(item.period_days || 0), 0) });
    return;
  }

  if (pathname === "/api/plans/upload" && req.method === "POST") {
    const buffer = await readBody(req);
    const fileName = decodeURIComponent(req.headers["x-file-name"] || `plan-${Date.now()}.pdf`);
    const pdfId = id();
    const filePath = path.join(STORAGE_DIR, `${pdfId}-${path.basename(fileName)}`);
    await writeFile(filePath, buffer);
    const structured = extractPlan(buffer, fileName);
    const plan = { id: id(), user_id: user.id, name: structured.name, objective: structured.objective, status: "active", processing_status: "needs_review", created_at: now(), updated_at: now(), deleted_at: null };
    db.plans.push(plan);
    const pdf = { id: pdfId, plan_id: plan.id, file_path: filePath, file_name: fileName, mime_type: req.headers["content-type"] || "application/pdf", storage_status: "private", created_at: now(), deleted_at: null };
    const version = materializePlan(db, user.id, plan, structured, pdf);
    db.auditEvents.push({ id: id(), user_id: user.id, event: "plan_uploaded", entity_id: plan.id, created_at: now() });
    await saveDb(db);
    sendJson(res, { plan, version, structured_data: structured });
    return;
  }

  if (pathname === "/api/plans" && req.method === "GET") {
    const plans = db.plans.filter((item) => item.user_id === user.id && !item.deleted_at).map((plan) => ({ ...plan, current_version: db.planVersions.find((entry) => entry.plan_id === plan.id && entry.is_current && !entry.deleted_at) }));
    sendJson(res, { plans });
    return;
  }

  const planId = pathname.match(/^\/api\/plans\/([^/]+)$/)?.[1];
  if (planId && req.method === "GET") {
    const plan = db.plans.find((item) => item.id === planId && item.user_id === user.id && !item.deleted_at);
    if (!plan) return sendJson(res, { error: "Not found" }, 404);
    const versions = db.planVersions.filter((item) => item.plan_id === plan.id && !item.deleted_at);
    const pdf = db.uploadedPdfs.find((item) => item.plan_id === plan.id && !item.deleted_at);
    sendJson(res, { plan, versions, pdf });
    return;
  }
  const planPatch = pathname.match(/^\/api\/plans\/([^/]+)$/)?.[1];
  if (planPatch && req.method === "PATCH") {
    const body = await readBody(req);
    const plan = db.plans.find((item) => item.id === planPatch && item.user_id === user.id && !item.deleted_at);
    if (!plan) return sendJson(res, { error: "Not found" }, 404);
    Object.assign(plan, { name: body.name ?? plan.name, objective: body.objective ?? plan.objective, processing_status: body.processing_status ?? plan.processing_status, updated_at: now() });
    await saveDb(db);
    sendJson(res, { plan });
    return;
  }
  const activateId = pathname.match(/^\/api\/plans\/([^/]+)\/activate$/)?.[1];
  if (activateId && req.method === "POST") {
    const plan = db.plans.find((item) => item.id === activateId && item.user_id === user.id && !item.deleted_at);
    if (!plan) return sendJson(res, { error: "Not found" }, 404);
    db.plans.filter((item) => item.user_id === user.id && !item.deleted_at).forEach((item) => item.status = item.id === plan.id ? "active" : "archived");
    plan.updated_at = now();
    db.auditEvents.push({ id: id(), user_id: user.id, event: "plan_activated", entity_id: plan.id, created_at: now() });
    await saveDb(db);
    sendJson(res, { plan });
    return;
  }
  const deletePlanId = pathname.match(/^\/api\/plans\/([^/]+)$/)?.[1];
  if (deletePlanId && req.method === "DELETE") {
    const plan = db.plans.find((item) => item.id === deletePlanId && item.user_id === user.id && !item.deleted_at);
    if (!plan) return sendJson(res, { error: "Not found" }, 404);
    plan.deleted_at = now();
    plan.updated_at = now();
    await saveDb(db);
    sendJson(res, { ok: true });
    return;
  }

  if (pathname === "/api/recipes") {
    const recipes = db.recipes.filter((item) => item.user_id === user.id && !item.deleted_at).map((recipe) => recipeDetails(db, recipe));
    sendJson(res, { recipes });
    return;
  }
  const recipeDelete = pathname.match(/^\/api\/recipes\/([^/]+)$/)?.[1];
  if (recipeDelete && req.method === "DELETE") {
    const recipe = db.recipes.find((item) => item.id === recipeDelete && item.user_id === user.id && !item.deleted_at);
    if (!recipe) return sendJson(res, { error: "Not found" }, 404);
    recipe.deleted_at = now();
    await saveDb(db);
    sendJson(res, { ok: true });
    return;
  }

  if (pathname === "/api/cart" && req.method === "GET") {
    sendJson(res, consolidateCart(db, user.id));
    return;
  }
  if (pathname === "/api/cart/items" && req.method === "POST") {
    const body = await readBody(req);
    const cart = db.carts.find((item) => item.user_id === user.id && item.status === "active" && !item.deleted_at);
    let manualIngredientId = null;
    if (body.source_type === "manual") {
      const usage = ensureIngredientUsage(db, user.id, { name: body.name, quantity: body.quantity, unit: body.unit, category: body.category || categoryFor(body.name) }, "manual", "pending");
      manualIngredientId = usage.ingredient_id;
      usage.deleted_at = now();
    }
    const item = { id: id(), cart_id: cart.id, source_type: body.source_type, source_id: body.source_id || null, quantity_multiplier: Number(body.quantity_multiplier || body.period_days || 1), period_days: Number(body.period_days || 0), training_days: Number(body.training_days || 0), selected_alternatives: body.selected_alternatives || {}, include_add_ons: body.include_add_ons ?? true, include_supplements: body.include_supplements ?? false, manual_name: body.name || null, manual_quantity: Number(body.quantity || 1), manual_unit: body.unit || "", manual_ingredient_id: manualIngredientId, created_at: now(), updated_at: now(), deleted_at: null };
    db.cartItems.push(item);
    await saveDb(db);
    sendJson(res, { item, cart: consolidateCart(db, user.id) });
    return;
  }
  const cartItemDelete = pathname.match(/^\/api\/cart\/items\/([^/]+)$/)?.[1];
  if (cartItemDelete && req.method === "DELETE") {
    const cart = db.carts.find((item) => item.user_id === user.id && item.status === "active");
    const item = db.cartItems.find((entry) => entry.id === cartItemDelete && entry.cart_id === cart?.id && !entry.deleted_at);
    if (item) item.deleted_at = now();
    await saveDb(db);
    sendJson(res, consolidateCart(db, user.id));
    return;
  }
  if (pathname === "/api/cart/clear" && req.method === "POST") {
    const cart = db.carts.find((item) => item.user_id === user.id && item.status === "active");
    db.cartItems.filter((entry) => entry.cart_id === cart?.id && !entry.deleted_at).forEach((entry) => entry.deleted_at = now());
    await saveDb(db);
    sendJson(res, consolidateCart(db, user.id));
    return;
  }
  if (pathname === "/api/cart/generate-list" && req.method === "POST") {
    const body = await readBody(req);
    const cartData = consolidateCart(db, user.id);
    const plan = activePlan(db, user.id);
    const list = { id: id(), user_id: user.id, name: body.name || `Lista ${new Date().toLocaleDateString("es-MX")}`, plan_version_id: plan?.current_version?.id || null, period_days: Number(body.period_days || 0), generated_from_cart_id: cartData.cart.id, snapshot_data: { sources: cartData.sources, generated_at: now() }, created_at: now(), updated_at: now(), deleted_at: null };
    db.shoppingLists.push(list);
    cartData.ingredients.forEach((ingredient) => {
      const canonical = db.ingredients.find((item) => normalize(item.canonical_name) === normalize(ingredient.name) && item.user_id === user.id);
      db.shoppingListItems.push({ id: id(), shopping_list_id: list.id, ingredient_id: canonical?.id || null, name_snapshot: ingredient.name, quantity_snapshot: ingredient.quantity, unit_snapshot: ingredient.unit, category_snapshot: ingredient.category, status: "Pendiente", substitution_data: null, source_breakdown: ingredient.sources, created_at: now(), updated_at: now(), deleted_at: null });
    });
    await saveDb(db);
    sendJson(res, { list, items: db.shoppingListItems.filter((item) => item.shopping_list_id === list.id) });
    return;
  }

  if (pathname === "/api/shopping-lists" && req.method === "GET") {
    const lists = db.shoppingLists.filter((item) => item.user_id === user.id && !item.deleted_at).map((list) => ({ ...list, items: db.shoppingListItems.filter((item) => item.shopping_list_id === list.id && !item.deleted_at) }));
    sendJson(res, { lists });
    return;
  }
  const listItemPatch = pathname.match(/^\/api\/shopping-lists\/([^/]+)\/items\/([^/]+)$/);
  if (listItemPatch && req.method === "PATCH") {
    const body = await readBody(req);
    const [_, listId, itemId] = listItemPatch;
    const list = db.shoppingLists.find((item) => item.id === listId && item.user_id === user.id && !item.deleted_at);
    const item = list && db.shoppingListItems.find((entry) => entry.id === itemId && entry.shopping_list_id === list.id && !entry.deleted_at);
    if (!item) return sendJson(res, { error: "Not found" }, 404);
    item.status = body.status || item.status;
    item.substitution_data = body.substitution_data ?? item.substitution_data;
    item.updated_at = now();
    await saveDb(db);
    sendJson(res, { item });
    return;
  }
  const listExport = pathname.match(/^\/api\/shopping-lists\/([^/]+)\/export$/)?.[1];
  if (listExport && req.method === "POST") {
    const body = await readBody(req);
    const list = db.shoppingLists.find((item) => item.id === listExport && item.user_id === user.id && !item.deleted_at);
    if (!list) return sendJson(res, { error: "Not found" }, 404);
    send(res, 200, exportList(db, list, body.format || "markdown"), { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  const saveTemplate = pathname.match(/^\/api\/shopping-lists\/([^/]+)\/save-template$/)?.[1];
  if (saveTemplate && req.method === "POST") {
    const body = await readBody(req);
    const list = db.shoppingLists.find((item) => item.id === saveTemplate && item.user_id === user.id && !item.deleted_at);
    if (!list) return sendJson(res, { error: "Not found" }, 404);
    const template = { id: id(), user_id: user.id, name: body.name || `${list.name} plantilla`, description: body.description || "", source_config: list.snapshot_data, reference_snapshot: { list, items: db.shoppingListItems.filter((item) => item.shopping_list_id === list.id && !item.deleted_at) }, created_at: now(), updated_at: now(), deleted_at: null };
    db.shoppingTemplates.push(template);
    await saveDb(db);
    sendJson(res, { template });
    return;
  }
  const deleteList = pathname.match(/^\/api\/shopping-lists\/([^/]+)$/)?.[1];
  if (deleteList && req.method === "DELETE") {
    const list = db.shoppingLists.find((item) => item.id === deleteList && item.user_id === user.id && !item.deleted_at);
    if (list) list.deleted_at = now();
    await saveDb(db);
    sendJson(res, { ok: true });
    return;
  }

  if (pathname === "/api/templates" && req.method === "GET") {
    sendJson(res, { templates: db.shoppingTemplates.filter((item) => item.user_id === user.id && !item.deleted_at) });
    return;
  }
  const loadTemplate = pathname.match(/^\/api\/templates\/([^/]+)\/load-to-cart$/)?.[1];
  if (loadTemplate && req.method === "POST") {
    const body = await readBody(req);
    const template = db.shoppingTemplates.find((item) => item.id === loadTemplate && item.user_id === user.id && !item.deleted_at);
    if (!template) return sendJson(res, { error: "Not found" }, 404);
    const cart = db.carts.find((item) => item.user_id === user.id && item.status === "active");
    if (body.mode !== "append") db.cartItems.filter((item) => item.cart_id === cart.id && !item.deleted_at).forEach((item) => item.deleted_at = now());
    const syntheticList = template.reference_snapshot.list;
    db.cartItems.push({ id: id(), cart_id: cart.id, source_type: "shopping_list", source_id: syntheticList.id, quantity_multiplier: 1, period_days: syntheticList.period_days || 0, training_days: 0, selected_alternatives: {}, include_add_ons: true, include_supplements: false, created_at: now(), updated_at: now(), deleted_at: null });
    await saveDb(db);
    sendJson(res, { warning: "Plantilla cargada desde snapshot. Si las fuentes originales cambiaron, revisa la lista consolidada.", cart: consolidateCart(db, user.id) });
    return;
  }

  if (pathname === "/api/rag/chat" && req.method === "POST") {
    const body = await readBody(req);
    sendJson(res, ragAnswer(db, user.id, body.message || "", body.scope || "auto"));
    return;
  }

  if (pathname === "/api/trash" && req.method === "GET") {
    const typed = [
      ...db.plans.filter((item) => item.user_id === user.id && item.deleted_at).map((item) => ({ type: "plan", ...item })),
      ...db.recipes.filter((item) => item.user_id === user.id && item.deleted_at).map((item) => ({ type: "recipe", ...item })),
      ...db.shoppingLists.filter((item) => item.user_id === user.id && item.deleted_at).map((item) => ({ type: "shopping_list", ...item })),
      ...db.shoppingTemplates.filter((item) => item.user_id === user.id && item.deleted_at).map((item) => ({ type: "template", ...item }))
    ];
    sendJson(res, { items: typed });
    return;
  }
  const restore = pathname.match(/^\/api\/trash\/([^/]+)\/([^/]+)\/restore$/);
  if (restore && req.method === "POST") {
    const [, type, entityId] = restore;
    const map = { plan: "plans", recipe: "recipes", shopping_list: "shoppingLists", template: "shoppingTemplates" };
    const collection = db[map[type]];
    const item = collection?.find((entry) => entry.id === entityId && entry.user_id === user.id);
    if (!item) return sendJson(res, { error: "Not found" }, 404);
    item.deleted_at = null;
    item.updated_at = now();
    await saveDb(db);
    sendJson(res, { item });
    return;
  }

  if (pathname === "/api/settings" && req.method === "GET") {
    sendJson(res, { ingredients: db.ingredients.filter((item) => item.user_id === user.id && !item.deleted_at), aliases: db.ingredientAliases, settings: db.settings });
    return;
  }

  sendJson(res, { error: "Not found" }, 404);
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
  const ext = path.extname(filePath);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
  if (!existsSync(filePath)) return send(res, 404, "Not found");
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url.pathname);
    else serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: error.message }, 500);
  }
}).listen(PORT, () => {
  console.log(`Nutritional Manager running at http://localhost:${PORT}`);
});
