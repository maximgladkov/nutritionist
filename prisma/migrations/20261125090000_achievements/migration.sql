-- Badges a person has earned (kept for good), and things they did for the first time that nothing
-- else records.
CREATE TABLE "UserAchievement" (
  "userId" TEXT NOT NULL,
  "achievementId" TEXT NOT NULL,
  "earnedOn" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId", "achievementId")
);

CREATE TABLE "AchievementEvent" (
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AchievementEvent_pkey" PRIMARY KEY ("userId", "kind")
);

ALTER TABLE "UserAchievement"
  ADD CONSTRAINT "UserAchievement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AchievementEvent"
  ADD CONSTRAINT "AchievementEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
