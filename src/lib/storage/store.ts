import type { AppDb, AppUser } from "@/lib/types";
import { Prisma } from "@/generated/prisma/client";
import { emptyDb } from "@/lib/storage/db";
import { prisma } from "@/lib/storage/pg";

// Postgres access in the AppDb shape the domain functions (src/lib/domain) compute over.
// Loaders fetch only the collections a page or route needs, scoped to one user and in insertion
// order; writers persist exactly the rows a mutation created or changed.

export type Collection = Exclude<keyof AppDb, "users" | "sessions" | "settings">;
export type Db = AppDb;
type Row = Record<string, unknown>;
type Client = Prisma.TransactionClient | typeof prisma;
type Delegate = {
  findMany(args: { where?: Row; orderBy: Row }): Promise<Row[]>;
  createMany(args: { data: Row[] }): Promise<unknown>;
};

const models: Record<Collection, Prisma.ModelName> = {
  plans: "Plan",
  planVersions: "PlanVersion",
  uploadedPdfs: "UploadedPdf",
  mealTypes: "MealType",
  mealOptions: "MealOption",
  recipes: "Recipe",
  planVersionRecipes: "PlanVersionRecipe",
  sharedAddOns: "SharedAddOn",
  ingredients: "Ingredient",
  ingredientAliases: "IngredientAlias",
  ingredientUsages: "IngredientUsage",
  alternativeGroups: "AlternativeGroup",
  carts: "Cart",
  cartItems: "CartItem",
  shoppingLists: "ShoppingList",
  shoppingListItems: "ShoppingListItem",
  shoppingTemplates: "ShoppingTemplate",
  ragIndexes: "RagIndex",
  auditEvents: "AuditEvent",
  dailyLogs: "DailyLog"
};

// Parents before children, for inserts.
const insertOrder: Collection[] = [
  "plans", "planVersions", "uploadedPdfs", "mealTypes", "recipes", "ingredients", "ingredientAliases", "alternativeGroups",
  "ingredientUsages", "mealOptions", "planVersionRecipes", "sharedAddOns", "carts", "cartItems", "shoppingLists",
  "shoppingListItems", "shoppingTemplates", "ragIndexes", "auditEvents", "dailyLogs"
];

const scalarFields: Record<Collection, Record<string, string>> = {
  plans: Prisma.PlanScalarFieldEnum,
  planVersions: Prisma.PlanVersionScalarFieldEnum,
  uploadedPdfs: Prisma.UploadedPdfScalarFieldEnum,
  mealTypes: Prisma.MealTypeScalarFieldEnum,
  mealOptions: Prisma.MealOptionScalarFieldEnum,
  recipes: Prisma.RecipeScalarFieldEnum,
  planVersionRecipes: Prisma.PlanVersionRecipeScalarFieldEnum,
  sharedAddOns: Prisma.SharedAddOnScalarFieldEnum,
  ingredients: Prisma.IngredientScalarFieldEnum,
  ingredientAliases: Prisma.IngredientAliasScalarFieldEnum,
  ingredientUsages: Prisma.IngredientUsageScalarFieldEnum,
  alternativeGroups: Prisma.AlternativeGroupScalarFieldEnum,
  carts: Prisma.CartScalarFieldEnum,
  cartItems: Prisma.CartItemScalarFieldEnum,
  shoppingLists: Prisma.ShoppingListScalarFieldEnum,
  shoppingListItems: Prisma.ShoppingListItemScalarFieldEnum,
  shoppingTemplates: Prisma.ShoppingTemplateScalarFieldEnum,
  ragIndexes: Prisma.RagIndexScalarFieldEnum,
  auditEvents: Prisma.AuditEventScalarFieldEnum,
  dailyLogs: Prisma.DailyLogScalarFieldEnum
};

// Rows that belong to one user, reached through their owning parent.
function ownedBy(collection: Collection, userId: string): Row | undefined {
  const viaPlan = { plan: { user_id: userId } };
  const viaVersion = { planVersion: viaPlan };
  switch (collection) {
    case "planVersions":
    case "uploadedPdfs":
      return viaPlan;
    case "mealTypes":
    case "mealOptions":
    case "planVersionRecipes":
    case "sharedAddOns":
      return viaVersion;
    case "ingredientUsages":
      return { OR: [{ ingredient: { user_id: userId } }, { ingredient_id: null }] };
    case "cartItems":
      return { cart: { user_id: userId } };
    case "shoppingListItems":
      return { shoppingList: { user_id: userId } };
    case "ingredientAliases":
    case "alternativeGroups":
      return undefined;
    default:
      return { user_id: userId };
  }
}

// Columns db.json records may simply not have; dropped when null so responses keep their shape.
const omitWhenNull: Partial<Record<Collection, string[]>> = {
  ingredientUsages: ["name_snapshot", "category_snapshot"],
  sharedAddOns: ["required", "notes"]
};

function delegate(client: Client, collection: Collection): Delegate {
  const model = models[collection];
  return (client as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)];
}

// Postgres row -> db.json record.
export function toRecord(collection: Collection | "users", row: Row): Row {
  const record: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "seq") continue;
    if (key === "extra") Object.assign(record, value as Row);
    else if (value === null && omitWhenNull[collection as Collection]?.includes(key)) continue;
    else if (value instanceof Date) record[key] = collection === "dailyLogs" && key === "date" ? value.toISOString().slice(0, 10) : value.toISOString();
    else record[key] = value;
  }
  return record;
}

// db.json record -> Postgres row. Unknown keys go to `extra` where the model has it.
export function toRow(collection: Collection, record: Row): Row {
  const fields = scalarFields[collection];
  const row: Row = {};
  const extra: Row = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "seq") continue;
    if (key in fields && key !== "extra") row[key] = value === null && (key === "substitution_data" || key === "source_config") ? Prisma.DbNull : value;
    else extra[key] = value;
  }
  if (collection === "dailyLogs" && typeof row.date === "string") row.date = new Date(`${row.date}T00:00:00.000Z`);
  if (Object.keys(extra).length) {
    if (!("extra" in fields)) throw new Error(`${collection}: no column for ${Object.keys(extra).join(", ")}`);
    row.extra = extra;
  }
  return row;
}

export const toUser = (row: Row) => toRecord("users", row) as unknown as AppUser;

export async function loadSettings(client: Client = prisma): Promise<AppDb["settings"]> {
  const row = await client.settings.findUnique({ where: { id: 1 } });
  return (row?.data as AppDb["settings"] | undefined) ?? emptyDb().settings;
}

type LoadOptions = { settings?: boolean; empty?: Collection[] };

// Loads the user's rows of the given collections. Collections listed in `empty` start as [] so
// mutations can append to them without reading existing rows. In development, touching a
// collection that wasn't loaded throws instead of silently computing over an empty array.
export async function loadDb(user: AppUser, collections: Collection[], options: LoadOptions = {}, client: Client = prisma): Promise<Db> {
  const db = { users: [user], sessions: {} } as unknown as Db;
  const loaded = new Set<string>(["users", "sessions", ...collections, ...(options.empty ?? [])]);
  await Promise.all([
    ...collections.map(async (collection) => {
      const rows = await delegate(client, collection).findMany({ where: ownedBy(collection, user.id), orderBy: { seq: "asc" } });
      (db as unknown as Record<string, Row[]>)[collection] = rows.map((row) => toRecord(collection, row));
    }),
    options.settings ? loadSettings(client).then((settings) => { db.settings = settings; loaded.add("settings"); }) : null
  ]);
  for (const collection of options.empty ?? []) (db as unknown as Record<string, Row[]>)[collection] = [];
  if (process.env.NODE_ENV === "production") return db;
  return new Proxy(db, {
    get(target, key) {
      if (typeof key === "string" && !loaded.has(key) && key !== "then" && key !== "toJSON") throw new Error(`loadDb: "${key}" was not loaded`);
      return Reflect.get(target, key);
    }
  });
}

// Records how long each collection is, so the rows a domain mutation appends can be persisted.
export function mark(db: Db, collections: Collection[]) {
  return Object.fromEntries(collections.map((collection) => [collection, db[collection].length])) as Partial<Record<Collection, number>>;
}

export async function insertAppended(client: Client, db: Db, marks: Partial<Record<Collection, number>>) {
  for (const collection of insertOrder) {
    const from = marks[collection];
    if (from === undefined) continue;
    const rows = (db[collection] as unknown as Row[]).slice(from);
    if (rows.length) await delegate(client, collection).createMany({ data: rows.map((row) => toRow(collection, row)) });
  }
}

export async function insertRecord(client: Client, collection: Collection, record: Row) {
  await delegate(client, collection).createMany({ data: [toRow(collection, record)] });
}

// Collections the cart consolidation (and the active plan's add-ons) read.
export const cartCollections: Collection[] = [
  "carts", "cartItems", "recipes", "ingredientUsages", "ingredients", "shoppingLists", "shoppingListItems",
  "plans", "planVersions", "planVersionRecipes", "sharedAddOns"
];

// Collections recipeDetails reads (ingredients and plan appearances).
export const recipeCollections: Collection[] = ["recipes", "ingredientUsages", "ingredients", "planVersionRecipes", "planVersions", "plans", "mealTypes"];

export const union = (...groups: Collection[][]) => [...new Set(groups.flat())];
