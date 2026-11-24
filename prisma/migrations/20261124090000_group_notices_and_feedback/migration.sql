-- Groups: join codes, member-list visibility, owner title, notices, member replies and "helpful".

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "joinCode" TEXT,
ADD COLUMN     "membersVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ownerTitle" TEXT NOT NULL DEFAULT '';

-- Give existing groups a code: up to four letters of the name plus four characters of the id hash.
UPDATE "Group"
SET "joinCode" = COALESCE(NULLIF(UPPER(LEFT(REGEXP_REPLACE("name", '[^A-Za-z]', '', 'g'), 4)), ''), 'BTR')
  || '-' || UPPER(LEFT(MD5("id"), 4));

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "noticesReadAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GroupMessage" ADD COLUMN     "helpfulAt" TIMESTAMP(3),
ADD COLUMN     "replyToId" TEXT;

-- CreateTable
CREATE TABLE "GroupNotice" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupNotice_groupId_createdAt_idx" ON "GroupNotice"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupNotice_authorId_idx" ON "GroupNotice"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_joinCode_key" ON "Group"("joinCode");

-- CreateIndex
CREATE INDEX "GroupMessage_replyToId_idx" ON "GroupMessage"("replyToId");

-- AddForeignKey
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "GroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupNotice" ADD CONSTRAINT "GroupNotice_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupNotice" ADD CONSTRAINT "GroupNotice_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
