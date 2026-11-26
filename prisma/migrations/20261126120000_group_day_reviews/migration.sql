-- Group owners review members' days: which days they went through, quick reactions on parts of a
-- day, and comments about a part of the day (a total or a meal). What the owner leaves while
-- reviewing reaches the member when the day is marked reviewed.
ALTER TABLE "GroupMessage" ADD COLUMN "targetPart" TEXT;
-- Owner comments written while reviewing a day wait here until the day is marked reviewed.
ALTER TABLE "GroupMessage" ADD COLUMN "draftFor" TEXT;

CREATE TABLE "GroupDayReview" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "reviewedById" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupDayReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupDayReaction" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "part" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupDayReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupDayReview_groupId_memberId_date_key" ON "GroupDayReview"("groupId", "memberId", "date");
CREATE INDEX "GroupDayReview_memberId_idx" ON "GroupDayReview"("memberId");
CREATE UNIQUE INDEX "GroupDayReaction_groupId_memberId_date_part_key" ON "GroupDayReaction"("groupId", "memberId", "date", "part");
CREATE INDEX "GroupDayReaction_memberId_idx" ON "GroupDayReaction"("memberId");

ALTER TABLE "GroupDayReview" ADD CONSTRAINT "GroupDayReview_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupDayReview" ADD CONSTRAINT "GroupDayReview_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupDayReaction" ADD CONSTRAINT "GroupDayReaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupDayReaction" ADD CONSTRAINT "GroupDayReaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
