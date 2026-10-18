import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AppDb } from "@/lib/types";
import { now } from "@/lib/domain/nutrition";

export const rootDir = process.cwd();
export const dataDir = path.join(rootDir, "data");
export const storageDir = path.join(dataDir, "private-pdfs");
export const dbPath = path.join(dataDir, "db.json");

export function emptyDb(): AppDb {
  return {
    users: [{ id: "demo-user", email: "demo@nutritional.local", name: "Demo User", weight_goal_kg: null, activity_goal_days: 4, created_at: now(), updated_at: now(), deleted_at: null }],
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
    dailyLogs: [],
    settings: {
      alGustoDefaults: {
        tomate: { quantity: 1, unit: "pieza" },
        cebolla: { quantity: 0.25, unit: "pieza" },
        "chile serrano": { quantity: 1, unit: "pieza" },
        cilantro: { quantity: 1, unit: "manojo" }
      },
      excludedAlGusto: ["sal", "condimentos", "especias", "limon", "jugo de limon"]
    }
  };
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
}

export async function ensureDb() {
  await mkdir(storageDir, { recursive: true });
  if (!existsSync(dbPath)) await writeJson(dbPath, emptyDb());
}

export async function readDb(): Promise<AppDb> {
  await ensureDb();
  const db = JSON.parse(await readFile(dbPath, "utf8")) as AppDb;
  db.dailyLogs ??= [];
  return db;
}

export async function saveDb(db: AppDb) {
  await writeJson(dbPath, db);
}

export async function updateDb<T>(mutator: (db: AppDb) => T | Promise<T>) {
  const db = await readDb();
  const result = await mutator(db);
  await saveDb(db);
  return { db, result };
}
