-- AlterTable
ALTER TABLE "alternative_groups" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "daily_logs" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "ingredient_aliases" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "ingredient_usages" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "meal_options" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "meal_types" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "plan_version_recipes" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "plan_versions" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "rag_indexes" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "shared_add_ons" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "shopping_list_items" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "shopping_lists" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "shopping_templates" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "uploaded_pdfs" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "seq" SERIAL NOT NULL;
