import { z } from "zod";
import { MAX_MESSAGE } from "@/lib/assistant";

export const loginSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1)
});

export const planPatchSchema = z.object({
  name: z.string().min(1).optional(),
  objective: z.string().optional(),
  processing_status: z.enum(["needs_review", "confirmed"]).optional()
});

export const recipePatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional()
});

export const cartItemSchema = z.discriminatedUnion("source_type", [
  z.object({
    source_type: z.literal("recipe"),
    source_id: z.string().min(1),
    quantity_multiplier: z.coerce.number().positive().optional(),
    period_days: z.coerce.number().min(0).optional(),
    training_days: z.coerce.number().min(0).optional(),
    include_add_ons: z.boolean().optional(),
    include_supplements: z.boolean().optional(),
    selected_alternatives: z.record(z.unknown()).optional()
  }),
  z.object({
    source_type: z.literal("manual"),
    name: z.string().min(1),
    quantity: z.coerce.number().positive(),
    unit: z.string().default(""),
    category: z.string().optional()
  }),
  z.object({
    source_type: z.literal("shopping_list"),
    source_id: z.string().min(1),
    quantity_multiplier: z.coerce.number().positive().optional(),
    period_days: z.coerce.number().min(0).optional()
  })
]);

export const generateListSchema = z.object({
  name: z.string().min(1).optional(),
  period_days: z.coerce.number().min(0).optional()
});

export const listItemStatusSchema = z.object({
  status: z.enum(["Pendiente", "Comprado", "No encontrado", "Omitido", "Sustituido manualmente"]),
  substitution_data: z.unknown().optional()
});

export const exportSchema = z.object({
  format: z.enum(["markdown", "json", "text"]).default("markdown")
});

export const saveTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional()
});

export const loadTemplateSchema = z.object({
  mode: z.enum(["replace", "append"]).default("replace")
});

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha invalida");

export const dailyLogSchema = z.object({
  meals_done: z.array(z.string().min(1)).max(20).optional(),
  water_glasses: z.coerce.number().int().min(0).max(20).optional(),
  weight_kg: z.number().min(20, "Peso invalido").max(400, "Peso invalido").nullable().optional(),
  exercised: z.boolean().optional()
});

export const goalsSchema = z.object({
  weight_goal_kg: z.number().min(20, "Meta invalida").max(400, "Meta invalida").nullable().optional(),
  activity_goal_days: z.number().int().min(1).max(7).optional()
});

export const mealTypePatchSchema = z.object({
  time_window: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Hora invalida")
});

export const chatSchema = z.object({
  // Trimmed first, so the limit counts the trimmed text's UTF-16 length like the composer does (REQ-10).
  message: z.string().trim().min(1).max(MAX_MESSAGE),
  scope: z.string().default("auto"),
  recipe_id: z.string().optional()
});
