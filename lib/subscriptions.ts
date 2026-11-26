import { appBundleId, type AppleRenewalInfo, type AppleTransaction, type AppleVerifier } from "./apple-storekit.ts";
import { appAccountToken, planForProduct } from "./plans.ts";
import { prisma } from "./prisma.ts";

export class SubscriptionError extends Error {
  readonly code: "other_account" | "unknown_product" | "wrong_app";

  constructor(code: SubscriptionError["code"], message: string) {
    super(message);
    this.name = "SubscriptionError";
    this.code = code;
  }
}

function paidUntil(transaction: AppleTransaction, renewal: AppleRenewalInfo | null): Date {
  const grace = renewal?.gracePeriodExpiresDate ?? 0;
  return new Date(Math.max(transaction.expiresDate ?? 0, grace));
}

function checkTransaction(transaction: AppleTransaction): void {
  if (transaction.bundleId !== appBundleId()) {
    throw new SubscriptionError("wrong_app", "That purchase is for another app.");
  }
  if (!planForProduct(transaction.productId)) {
    throw new SubscriptionError("unknown_product", "That isn't a Btr.me plan.");
  }
}

// After a purchase or a restore, the phone sends Apple's signed transaction; it's saved for whoever
// is signed in, unless it was bought from another Btr.me account.
export async function saveAppleTransaction(input: {
  signedTransaction: string;
  userId: string;
  verifier: AppleVerifier;
}): Promise<void> {
  const transaction = await input.verifier.transaction(input.signedTransaction);
  checkTransaction(transaction);
  if (transaction.appAccountToken && transaction.appAccountToken !== appAccountToken(input.userId)) {
    throw new SubscriptionError("other_account", "This subscription belongs to another Btr.me account.");
  }
  const existing = await prisma.appleSubscription.findUnique({
    where: { originalTransactionId: transaction.originalTransactionId },
  });
  if (existing && existing.userId !== input.userId) {
    throw new SubscriptionError("other_account", "This subscription belongs to another Btr.me account.");
  }
  const data = {
    environment: transaction.environment,
    // Never moves back: a restore can send an older transaction than a notification already saved.
    expiresAt: new Date(Math.max(paidUntil(transaction, null).getTime(), existing?.expiresAt.getTime() ?? 0)),
    productId: transaction.productId,
    revokedAt: transaction.revocationDate ? new Date(transaction.revocationDate) : null,
  };
  await prisma.appleSubscription.upsert({
    create: { ...data, originalTransactionId: transaction.originalTransactionId, userId: input.userId },
    update: data,
    where: { originalTransactionId: transaction.originalTransactionId },
  });
}

// App Store Server Notifications V2: renewals, expiries, refunds, cancelled auto-renew, plan changes.
// Subscriptions the app never told us about are left alone: there's no account to give them to.
export async function applyAppleNotification(signedPayload: string, verifier: AppleVerifier): Promise<void> {
  const notification = await verifier.notification(signedPayload);
  const data = notification.data;
  if (!data?.signedTransactionInfo || (data.bundleId && data.bundleId !== appBundleId())) {
    return;
  }
  const transaction = await verifier.transaction(data.signedTransactionInfo);
  if (transaction.bundleId !== appBundleId() || !planForProduct(transaction.productId)) {
    return;
  }
  const renewal = data.signedRenewalInfo ? await verifier.renewalInfo(data.signedRenewalInfo) : null;
  await prisma.appleSubscription.updateMany({
    data: {
      environment: transaction.environment,
      expiresAt: paidUntil(transaction, renewal),
      productId: transaction.productId,
      revokedAt: transaction.revocationDate ? new Date(transaction.revocationDate) : null,
      ...(renewal ? { willRenew: renewal.autoRenewStatus === 1 } : {}),
    },
    where: { originalTransactionId: transaction.originalTransactionId },
  });
}
