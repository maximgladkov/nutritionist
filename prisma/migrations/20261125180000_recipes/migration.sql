-- Recipes: what goes into them and how to make them.
CREATE TABLE "Recipe" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "servings" INTEGER NOT NULL,
  "minutes" INTEGER,
  "steps" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeItem" (
  "id" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT,
  "barcode" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "unit" "MealItemUnit" NOT NULL,
  "nutrimentsPer100g" JSONB NOT NULL,
  CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recipe_userId_idx" ON "Recipe"("userId");
CREATE INDEX "RecipeItem_recipeId_sortOrder_idx" ON "RecipeItem"("recipeId", "sortOrder");

ALTER TABLE "Recipe"
  ADD CONSTRAINT "Recipe_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecipeItem"
  ADD CONSTRAINT "RecipeItem_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
