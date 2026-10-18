import { ingestPdfPlan } from "@/lib/domain/plans";
import { badRequest, json } from "@/lib/http/respond";
import { requireSession } from "@/lib/http/auth";
import { prisma } from "@/lib/storage/pg";
import { insertAppended, loadDb, mark, type Collection } from "@/lib/storage/store";

// Everything a plan upload creates. Only plans, recipes and ingredients are read (to archive the
// previous active plan and to reuse recipes and catalog ingredients); the rest is append-only.
const created: Collection[] = ["planVersions", "uploadedPdfs", "mealTypes", "mealOptions", "planVersionRecipes", "sharedAddOns", "ingredientUsages", "ragIndexes", "auditEvents"];

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;
  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    const fileName = decodeURIComponent(request.headers.get("x-file-name") || `plan-${Date.now()}.pdf`);
    const db = await loadDb(auth.user, ["plans", "recipes", "ingredients"], { settings: true, empty: created });
    const marks = mark(db, ["plans", "recipes", "ingredients", ...created]);
    const wasActive = new Set(db.plans.filter((plan) => plan.status === "active").map((plan) => plan.id));
    const result = await ingestPdfPlan(db, auth.user.id, buffer, fileName, request.headers.get("content-type") || "application/pdf");
    const archived = db.plans.filter((plan) => wasActive.has(plan.id) && plan.status === "archived");
    await prisma.$transaction(async (tx) => {
      for (const plan of archived) await tx.plan.update({ where: { id: plan.id }, data: { status: plan.status, updated_at: plan.updated_at } });
      await insertAppended(tx, db, marks);
    });
    return json(result);
  } catch (error) {
    return badRequest(error);
  }
}
