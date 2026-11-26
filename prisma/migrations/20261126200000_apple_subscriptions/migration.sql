-- App Store subscriptions: one row per subscription (Apple's original transaction id), updated
-- from the app after a purchase and from App Store Server Notifications.
CREATE TABLE "AppleSubscription" (
  "originalTransactionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "willRenew" BOOLEAN NOT NULL DEFAULT true,
  "environment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppleSubscription_pkey" PRIMARY KEY ("originalTransactionId")
);

CREATE INDEX "AppleSubscription_userId_expiresAt_idx" ON "AppleSubscription"("userId", "expiresAt");

ALTER TABLE "AppleSubscription" ADD CONSTRAINT "AppleSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
