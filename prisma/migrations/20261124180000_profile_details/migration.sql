-- Profile details and photo.
ALTER TABLE "UserProfile"
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "birthDate" TEXT,
  ADD COLUMN "heightCm" DOUBLE PRECISION,
  ADD COLUMN "avatarId" TEXT,
  ADD COLUMN "filledFrom" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "UserProfile_avatarId_key" ON "UserProfile"("avatarId");

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_avatarId_fkey"
  FOREIGN KEY ("avatarId") REFERENCES "UserAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
