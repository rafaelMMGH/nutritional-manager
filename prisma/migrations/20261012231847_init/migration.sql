-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "processing_status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "structured_data" JSONB NOT NULL,
    "change_summary" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_pdfs" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "uploaded_pdfs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_types" (
    "id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "time_window" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "meal_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "canonical_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_options" (
    "id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "option_number" INTEGER NOT NULL,
    "is_unique_option" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "meal_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_version_recipes" (
    "id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "option_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "plan_version_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_add_ons" (
    "id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to_all_options" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN,
    "notes" TEXT,
    "canonical_hash" TEXT NOT NULL,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "shared_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "primary_unit" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_aliases" (
    "id" TEXT NOT NULL,
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ingredient_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alternative_groups" (
    "id" TEXT NOT NULL,
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "alternative_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_usages" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "practical_quantity" DOUBLE PRECISION,
    "practical_unit" TEXT,
    "notes" TEXT NOT NULL,
    "is_optional" BOOLEAN NOT NULL,
    "alternative_group_id" TEXT,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "requires_review" BOOLEAN NOT NULL,
    "name_snapshot" TEXT,
    "category_snapshot" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ingredient_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "quantity_multiplier" DOUBLE PRECISION NOT NULL,
    "period_days" INTEGER NOT NULL,
    "training_days" INTEGER NOT NULL,
    "selected_alternatives" JSONB NOT NULL,
    "include_add_ons" BOOLEAN NOT NULL,
    "include_supplements" BOOLEAN NOT NULL,
    "manual_name" TEXT,
    "manual_quantity" DOUBLE PRECISION,
    "manual_unit" TEXT,
    "manual_ingredient_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan_version_id" TEXT,
    "period_days" INTEGER NOT NULL,
    "generated_from_cart_id" TEXT NOT NULL,
    "snapshot_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL,
    "shopping_list_id" TEXT NOT NULL,
    "ingredient_id" TEXT,
    "name_snapshot" TEXT NOT NULL,
    "quantity_snapshot" DOUBLE PRECISION NOT NULL,
    "unit_snapshot" TEXT NOT NULL,
    "category_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "substitution_data" JSONB,
    "source_breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_config" JSONB,
    "reference_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "shopping_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_indexes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "index_metadata" JSONB NOT NULL,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "rag_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "entity_id" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meals_done" TEXT[],
    "water_glasses" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "plans_user_id_idx" ON "plans"("user_id");

-- CreateIndex
CREATE INDEX "plan_versions_plan_id_idx" ON "plan_versions"("plan_id");

-- CreateIndex
CREATE INDEX "uploaded_pdfs_plan_id_idx" ON "uploaded_pdfs"("plan_id");

-- CreateIndex
CREATE INDEX "meal_types_plan_version_id_idx" ON "meal_types"("plan_version_id");

-- CreateIndex
CREATE INDEX "recipes_user_id_idx" ON "recipes"("user_id");

-- CreateIndex
CREATE INDEX "recipes_canonical_hash_idx" ON "recipes"("canonical_hash");

-- CreateIndex
CREATE INDEX "meal_options_plan_version_id_idx" ON "meal_options"("plan_version_id");

-- CreateIndex
CREATE INDEX "meal_options_meal_type_id_idx" ON "meal_options"("meal_type_id");

-- CreateIndex
CREATE INDEX "meal_options_recipe_id_idx" ON "meal_options"("recipe_id");

-- CreateIndex
CREATE INDEX "plan_version_recipes_plan_version_id_idx" ON "plan_version_recipes"("plan_version_id");

-- CreateIndex
CREATE INDEX "plan_version_recipes_recipe_id_idx" ON "plan_version_recipes"("recipe_id");

-- CreateIndex
CREATE INDEX "plan_version_recipes_meal_type_id_idx" ON "plan_version_recipes"("meal_type_id");

-- CreateIndex
CREATE INDEX "shared_add_ons_plan_version_id_idx" ON "shared_add_ons"("plan_version_id");

-- CreateIndex
CREATE INDEX "shared_add_ons_meal_type_id_idx" ON "shared_add_ons"("meal_type_id");

-- CreateIndex
CREATE INDEX "ingredients_user_id_idx" ON "ingredients"("user_id");

-- CreateIndex
CREATE INDEX "ingredients_canonical_name_idx" ON "ingredients"("canonical_name");

-- CreateIndex
CREATE INDEX "ingredient_usages_ingredient_id_idx" ON "ingredient_usages"("ingredient_id");

-- CreateIndex
CREATE INDEX "ingredient_usages_source_type_source_id_idx" ON "ingredient_usages"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "carts_user_id_idx" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_items_manual_ingredient_id_idx" ON "cart_items"("manual_ingredient_id");

-- CreateIndex
CREATE INDEX "shopping_lists_user_id_idx" ON "shopping_lists"("user_id");

-- CreateIndex
CREATE INDEX "shopping_lists_plan_version_id_idx" ON "shopping_lists"("plan_version_id");

-- CreateIndex
CREATE INDEX "shopping_lists_generated_from_cart_id_idx" ON "shopping_lists"("generated_from_cart_id");

-- CreateIndex
CREATE INDEX "shopping_list_items_shopping_list_id_idx" ON "shopping_list_items"("shopping_list_id");

-- CreateIndex
CREATE INDEX "shopping_list_items_ingredient_id_idx" ON "shopping_list_items"("ingredient_id");

-- CreateIndex
CREATE INDEX "shopping_templates_user_id_idx" ON "shopping_templates"("user_id");

-- CreateIndex
CREATE INDEX "rag_indexes_user_id_idx" ON "rag_indexes"("user_id");

-- CreateIndex
CREATE INDEX "rag_indexes_scope_type_scope_id_idx" ON "rag_indexes"("scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "audit_events_user_id_idx" ON "audit_events"("user_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_id_idx" ON "audit_events"("entity_id");

-- CreateIndex
CREATE INDEX "daily_logs_user_id_date_idx" ON "daily_logs"("user_id", "date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_pdfs" ADD CONSTRAINT "uploaded_pdfs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_types" ADD CONSTRAINT "meal_types_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_options" ADD CONSTRAINT "meal_options_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_options" ADD CONSTRAINT "meal_options_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_options" ADD CONSTRAINT "meal_options_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_version_recipes" ADD CONSTRAINT "plan_version_recipes_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_version_recipes" ADD CONSTRAINT "plan_version_recipes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_version_recipes" ADD CONSTRAINT "plan_version_recipes_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_add_ons" ADD CONSTRAINT "shared_add_ons_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_add_ons" ADD CONSTRAINT "shared_add_ons_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_usages" ADD CONSTRAINT "ingredient_usages_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_manual_ingredient_id_fkey" FOREIGN KEY ("manual_ingredient_id") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_generated_from_cart_id_fkey" FOREIGN KEY ("generated_from_cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_shopping_list_id_fkey" FOREIGN KEY ("shopping_list_id") REFERENCES "shopping_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_templates" ADD CONSTRAINT "shopping_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_indexes" ADD CONSTRAINT "rag_indexes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
