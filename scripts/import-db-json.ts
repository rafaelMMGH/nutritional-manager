// Copies data/db.json into Postgres. Idempotent: every row is upserted on its primary key.
// Usage: npm run db:import [-- [--replace] path/to/db.json]
// --replace empties every table first, so rows the app has since deleted are gone and the
// insertion order (the seq column the app sorts by) follows db.json's array order exactly.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/storage/pg";
import type { AppDb } from "../src/lib/types";

type Row = Record<string, unknown>;
type Tx = Prisma.TransactionClient;
type Delegate = { upsert(args: { where: Row; create: Row; update: Row }): Promise<unknown>; count(): Promise<number> };

// Dependency order: parents before children. Field lists come from the generated client.
const collections: [keyof AppDb, Prisma.ModelName, Record<string, string>][] = [
  ["users", "User", Prisma.UserScalarFieldEnum],
  ["plans", "Plan", Prisma.PlanScalarFieldEnum],
  ["planVersions", "PlanVersion", Prisma.PlanVersionScalarFieldEnum],
  ["uploadedPdfs", "UploadedPdf", Prisma.UploadedPdfScalarFieldEnum],
  ["mealTypes", "MealType", Prisma.MealTypeScalarFieldEnum],
  ["recipes", "Recipe", Prisma.RecipeScalarFieldEnum],
  ["mealOptions", "MealOption", Prisma.MealOptionScalarFieldEnum],
  ["planVersionRecipes", "PlanVersionRecipe", Prisma.PlanVersionRecipeScalarFieldEnum],
  ["sharedAddOns", "SharedAddOn", Prisma.SharedAddOnScalarFieldEnum],
  ["ingredients", "Ingredient", Prisma.IngredientScalarFieldEnum],
  ["ingredientAliases", "IngredientAlias", Prisma.IngredientAliasScalarFieldEnum],
  ["alternativeGroups", "AlternativeGroup", Prisma.AlternativeGroupScalarFieldEnum],
  ["ingredientUsages", "IngredientUsage", Prisma.IngredientUsageScalarFieldEnum],
  ["carts", "Cart", Prisma.CartScalarFieldEnum],
  ["cartItems", "CartItem", Prisma.CartItemScalarFieldEnum],
  ["shoppingLists", "ShoppingList", Prisma.ShoppingListScalarFieldEnum],
  ["shoppingListItems", "ShoppingListItem", Prisma.ShoppingListItemScalarFieldEnum],
  ["shoppingTemplates", "ShoppingTemplate", Prisma.ShoppingTemplateScalarFieldEnum],
  ["ragIndexes", "RagIndex", Prisma.RagIndexScalarFieldEnum],
  ["auditEvents", "AuditEvent", Prisma.AuditEventScalarFieldEnum],
  ["dailyLogs", "DailyLog", Prisma.DailyLogScalarFieldEnum]
];

// Nullable Json columns need Prisma.DbNull instead of a plain null.
const nullableJson = new Set(["substitution_data", "source_config"]);

const unmapped = new Set<string>();

function delegate(client: Tx | typeof prisma, model: Prisma.ModelName): Delegate {
  const key = model[0].toLowerCase() + model.slice(1);
  return (client as unknown as Record<string, Delegate>)[key];
}

// Maps a db.json record onto the model's fields. Unknown keys go to `extra` when the model has it;
// otherwise the import fails so nothing is dropped silently.
function toRow(collection: string, fields: Record<string, string>, record: Row): Row {
  const row: Row = {};
  const leftover: Row = {};
  for (const [key, value] of Object.entries(record)) {
    if (key in fields && key !== "extra") row[key] = value === null && nullableJson.has(key) ? Prisma.DbNull : value;
    else leftover[key] = value;
  }
  if (collection === "dailyLogs" && typeof row.date === "string") row.date = new Date(`${row.date}T00:00:00.000Z`);
  if (Object.keys(leftover).length) {
    if (!("extra" in fields)) throw new Error(`${collection} ${record.id}: no column for ${Object.keys(leftover).join(", ")}`);
    row.extra = leftover;
    Object.keys(leftover).forEach((key) => unmapped.add(`${collection}.${key}`));
  }
  return row;
}

async function upsertAll(tx: Tx, model: Prisma.ModelName, rows: Row[], key: string) {
  const table = delegate(tx, model);
  for (const row of rows) await table.upsert({ where: { [key]: row[key] }, create: row, update: row });
}

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes("--replace");
  const file = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? "data/db.json");
  const db = JSON.parse(await readFile(file, "utf8")) as AppDb;
  const expected: [Prisma.ModelName, number][] = [];

  await prisma.$transaction(async (tx) => {
    if (replace) {
      const tables = await tx.$queryRaw<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`;
      await tx.$executeRawUnsafe(`truncate ${tables.map((table) => `"${table.tablename}"`).join(", ")} restart identity cascade`);
    }
    for (const [collection, model, fields] of collections) {
      const records = (db[collection] ?? []) as Row[];
      expected.push([model, records.length]);
      await upsertAll(tx, model, records.map((record) => toRow(collection, fields, record)), "id");
      // sessions/settings go right after users so their FK is satisfied.
      if (collection === "users") {
        const sessions = Object.entries(db.sessions ?? {}).map(([token, user_id]) => ({ token, user_id }));
        expected.push(["Session", sessions.length]);
        await upsertAll(tx, "Session", sessions, "token");
        expected.push(["Settings", db.settings ? 1 : 0]);
        if (db.settings) await upsertAll(tx, "Settings", [{ id: 1, data: db.settings }], "id");
      }
    }
  }, { timeout: 120_000 });

  const known = new Set([...collections.map(([c]) => c as string), "sessions", "settings"]);
  const skipped = Object.keys(db).filter((key) => !known.has(key));

  let mismatches = 0;
  console.log(`Imported ${file}\n`);
  console.log("model".padEnd(24) + "db.json".padStart(8) + "postgres".padStart(10));
  for (const [model, count] of expected) {
    const actual = await delegate(prisma, model).count();
    if (actual !== count) mismatches++;
    console.log(model.padEnd(24) + String(count).padStart(8) + String(actual).padStart(10) + (actual === count ? "" : "  MISMATCH"));
  }
  if (unmapped.size) console.log(`\nStored in extra: ${[...unmapped].join(", ")}`);
  if (skipped.length) console.log(`\nTop-level keys not imported: ${skipped.join(", ")}`);
  await prisma.$disconnect();
  if (mismatches) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
