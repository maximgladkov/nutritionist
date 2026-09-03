-- CreateEnum
CREATE TYPE "ReminderLabel" AS ENUM ('breakfast', 'lunch', 'dinner', 'summary');

-- AlterTable
ALTER TABLE "MealReminder" ALTER COLUMN "label" TYPE "ReminderLabel" USING ("label"::text::"ReminderLabel");
