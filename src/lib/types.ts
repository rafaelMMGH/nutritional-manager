export type AppUser = {
  id: string;
  email: string;
  name: string;
  weight_goal_kg: number | null;
  activity_goal_days: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Ingredient = {
  id: string;
  user_id: string;
  canonical_name: string;
  category: string;
  primary_unit: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type IngredientUsage = {
  id: string;
  ingredient_id: string | null;
  source_type: string;
  source_id: string;
  quantity: number;
  unit: string;
  practical_quantity: number | null;
  practical_unit: string | null;
  notes: string;
  is_optional: boolean;
  alternative_group_id: string | null;
  confidence_score: number;
  requires_review: boolean;
  created_at: string;
  deleted_at: string | null;
  name_snapshot?: string;
  category_snapshot?: string;
};

export type Plan = {
  id: string;
  user_id: string;
  name: string;
  objective: string;
  status: "active" | "archived";
  processing_status: "needs_review" | "confirmed";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PlanVersion = {
  id: string;
  plan_id: string;
  version_number: number;
  structured_data: StructuredPlan;
  change_summary: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type UploadedPdf = {
  id: string;
  plan_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  storage_status: string;
  created_at: string;
  deleted_at: string | null;
};

export type MealType = {
  id: string;
  plan_version_id: string;
  name: string;
  display_order: number;
  time_window: string;
  created_at: string;
  deleted_at: string | null;
};

export type Recipe = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  canonical_hash: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PlanVersionRecipe = {
  id: string;
  plan_version_id: string;
  recipe_id: string;
  meal_type_id: string;
  option_number: number;
  created_at: string;
  deleted_at: string | null;
};

export type MealOption = {
  id: string;
  plan_version_id: string;
  meal_type_id: string;
  recipe_id: string;
  option_number: number;
  is_unique_option: boolean;
  created_at: string;
  deleted_at: string | null;
};

export type Cart = {
  id: string;
  user_id: string;
  status: "active";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CartItem = {
  id: string;
  cart_id: string;
  source_type: "recipe" | "manual" | "shopping_list";
  source_id: string | null;
  quantity_multiplier: number;
  period_days: number;
  training_days: number;
  selected_alternatives: Record<string, unknown>;
  include_add_ons: boolean;
  include_supplements: boolean;
  manual_name?: string | null;
  manual_quantity?: number;
  manual_unit?: string;
  manual_ingredient_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ShoppingList = {
  id: string;
  user_id: string;
  name: string;
  plan_version_id: string | null;
  period_days: number;
  generated_from_cart_id: string;
  snapshot_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ShoppingListItem = {
  id: string;
  shopping_list_id: string;
  ingredient_id: string | null;
  name_snapshot: string;
  quantity_snapshot: number;
  unit_snapshot: string;
  category_snapshot: string;
  status: string;
  substitution_data: unknown;
  source_breakdown: unknown[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ShoppingTemplate = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  source_config: unknown;
  reference_snapshot: { list: ShoppingList; items: ShoppingListItem[] };
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DailyLog = {
  id: string;
  user_id: string;
  date: string;
  meals_done: string[];
  water_glasses: number;
  weight_kg: number | null;
  exercised: boolean;
  created_at: string;
  updated_at: string;
};

export type StructuredIngredient = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  confidence_score?: number;
  requires_review?: boolean;
  practical_quantity?: number;
  practical_unit?: string;
  notes?: string;
  is_optional?: boolean;
  alternative_group_id?: string | null;
};

export type StructuredRecipe = {
  name: string;
  description?: string;
  ingredients: StructuredIngredient[];
  alternatives?: StructuredIngredient[][];
};

export type StructuredMealOption = {
  option_number: number;
  recipe: StructuredRecipe;
  confidence_score: number;
  requires_review: boolean;
};

export type StructuredMeal = {
  name: string;
  time_window: string;
  options: StructuredMealOption[];
  add_ons?: { name: string; required: boolean; ingredients: StructuredIngredient[]; notes?: string }[];
  equivalents?: Record<string, number>;
};

export type StructuredPlan = {
  name: string;
  objective: string;
  diagnosis: string;
  recommendations: string;
  supplements: { name: string; quantity: number; unit: string }[];
  nutrition_summary: Record<string, unknown>;
  meals: StructuredMeal[];
};

export type AppDb = {
  users: AppUser[];
  sessions: Record<string, string>;
  plans: Plan[];
  planVersions: PlanVersion[];
  uploadedPdfs: UploadedPdf[];
  mealTypes: MealType[];
  mealOptions: MealOption[];
  recipes: Recipe[];
  planVersionRecipes: PlanVersionRecipe[];
  sharedAddOns: Record<string, unknown>[];
  ingredients: Ingredient[];
  ingredientAliases: Record<string, unknown>[];
  ingredientUsages: IngredientUsage[];
  alternativeGroups: Record<string, unknown>[];
  carts: Cart[];
  cartItems: CartItem[];
  shoppingLists: ShoppingList[];
  shoppingListItems: ShoppingListItem[];
  shoppingTemplates: ShoppingTemplate[];
  ragIndexes: Record<string, unknown>[];
  auditEvents: Record<string, unknown>[];
  dailyLogs: DailyLog[];
  settings: {
    alGustoDefaults: Record<string, { quantity: number; unit: string }>;
    excludedAlGusto: string[];
  };
};
