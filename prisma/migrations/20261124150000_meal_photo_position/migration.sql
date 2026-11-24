-- Meal photos get an order of their own, so people can rearrange them.
ALTER TABLE "MealPhoto" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Existing photos keep the order they were added in.
UPDATE "MealPhoto" AS photo
SET "position" = ordered.rank
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "mealId" ORDER BY "createdAt", "id") - 1 AS rank
  FROM "MealPhoto"
) AS ordered
WHERE photo."id" = ordered."id";
