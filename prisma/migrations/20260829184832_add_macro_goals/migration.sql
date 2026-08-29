-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GoalKind" ADD VALUE 'protein_g_per_day';
ALTER TYPE "GoalKind" ADD VALUE 'carbs_g_per_day';
ALTER TYPE "GoalKind" ADD VALUE 'fat_g_per_day';
ALTER TYPE "GoalKind" ADD VALUE 'fiber_g_per_day';
