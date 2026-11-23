-- Groups: each member agrees to what they share; the owner's later additions are asks.

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "allowedShares" "GroupShareKind"[] DEFAULT ARRAY[]::"GroupShareKind"[],
ADD COLUMN     "answeredShares" "GroupShareKind"[] DEFAULT ARRAY[]::"GroupShareKind"[];

-- Members who joined before this agreed to everything their group showed the owner.
UPDATE "GroupMember" AS m
SET "allowedShares" = g."shares", "answeredShares" = g."shares"
FROM "Group" AS g
WHERE g."id" = m."groupId" AND m."role" = 'member';
