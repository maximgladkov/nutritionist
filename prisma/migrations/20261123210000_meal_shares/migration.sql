-- CreateTable
CREATE TABLE "MealShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" "MealLabel" NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealShare_token_key" ON "MealShare"("token");

-- CreateIndex
CREATE INDEX "MealShare_userId_idx" ON "MealShare"("userId");

-- AddForeignKey
ALTER TABLE "MealShare" ADD CONSTRAINT "MealShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
