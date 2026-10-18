-- json instead of jsonb keeps object keys in the order they were written (jsonb re-sorts them).

-- AlterTable
ALTER TABLE "alternative_groups" ALTER COLUMN "extra" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "audit_events" ALTER COLUMN "extra" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "ingredient_aliases" ALTER COLUMN "extra" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "rag_indexes" ALTER COLUMN "extra" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "shared_add_ons" ALTER COLUMN "extra" SET DATA TYPE JSON;
-- AlterTable
ALTER TABLE "cart_items" ALTER COLUMN "selected_alternatives" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "plan_versions" ALTER COLUMN "structured_data" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "rag_indexes" ALTER COLUMN "index_metadata" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "settings" ALTER COLUMN "data" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "shopping_list_items" ALTER COLUMN "substitution_data" SET DATA TYPE JSON,
ALTER COLUMN "source_breakdown" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "shopping_lists" ALTER COLUMN "snapshot_data" SET DATA TYPE JSON;

-- AlterTable
ALTER TABLE "shopping_templates" ALTER COLUMN "source_config" SET DATA TYPE JSON,
ALTER COLUMN "reference_snapshot" SET DATA TYPE JSON;

