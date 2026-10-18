-- Merge duplicate daily logs (same user and day) into the earliest row before making the pair unique.
-- Meals done are combined; water comes from the most recently updated row.
UPDATE "daily_logs" AS keep
SET
  "meals_done" = ARRAY(
    SELECT DISTINCT meal
    FROM "daily_logs" AS dup, unnest(dup."meals_done") AS meal
    WHERE dup."user_id" = keep."user_id" AND dup."date" = keep."date"
  ),
  "water_glasses" = (
    SELECT dup."water_glasses" FROM "daily_logs" AS dup
    WHERE dup."user_id" = keep."user_id" AND dup."date" = keep."date"
    ORDER BY dup."updated_at" DESC, dup."seq" DESC LIMIT 1
  ),
  "updated_at" = (
    SELECT max(dup."updated_at") FROM "daily_logs" AS dup
    WHERE dup."user_id" = keep."user_id" AND dup."date" = keep."date"
  )
WHERE keep."seq" = (
  SELECT min(first."seq") FROM "daily_logs" AS first
  WHERE first."user_id" = keep."user_id" AND first."date" = keep."date"
)
AND (SELECT count(*) FROM "daily_logs" AS dup WHERE dup."user_id" = keep."user_id" AND dup."date" = keep."date") > 1;

DELETE FROM "daily_logs" AS extra
WHERE extra."seq" > (
  SELECT min(first."seq") FROM "daily_logs" AS first
  WHERE first."user_id" = extra."user_id" AND first."date" = extra."date"
);

DROP INDEX "daily_logs_user_id_date_idx";
CREATE UNIQUE INDEX "daily_logs_user_id_date_key" ON "daily_logs"("user_id", "date");

ALTER TABLE "daily_logs" ADD COLUMN "weight_kg" DOUBLE PRECISION, ADD COLUMN "exercised" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "weight_goal_kg" DOUBLE PRECISION, ADD COLUMN "activity_goal_days" INTEGER NOT NULL DEFAULT 4;
