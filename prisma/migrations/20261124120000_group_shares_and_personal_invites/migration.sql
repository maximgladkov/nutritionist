-- Groups: what members share with the owner, and personal one-time invites.

-- CreateEnum
CREATE TYPE "GroupShareKind" AS ENUM ('summary', 'meals', 'photos', 'weight', 'activity');

-- AlterTable: existing groups keep what owners could already see (everything but weight).
ALTER TABLE "Group" ADD COLUMN     "shares" "GroupShareKind"[] DEFAULT ARRAY['summary', 'meals', 'photos', 'activity']::"GroupShareKind"[];

-- CreateTable
CREATE TABLE "GroupInvite" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvite_code_key" ON "GroupInvite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvite_token_key" ON "GroupInvite"("token");

-- CreateIndex
CREATE INDEX "GroupInvite_groupId_createdAt_idx" ON "GroupInvite"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupInvite_createdById_idx" ON "GroupInvite"("createdById");

-- CreateIndex
CREATE INDEX "GroupInvite_usedById_idx" ON "GroupInvite"("usedById");

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
