ALTER TABLE "Group" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

UPDATE "Group" AS g
SET "locale" = p."locale"
FROM "UserProfile" AS p
WHERE p."userId" = g."ownerId"
  AND p."locale" IN ('en', 'ru');
