import { verify, X509Certificate } from "node:crypto";

// Checks data Apple signed for StoreKit 2 (a transaction from the phone, a server notification,
// renewal info): a JWS whose x5c chain ends at Apple Root CA G3 and whose leaf is Apple's
// App Store signing certificate. Built on node:crypto, like Sign in with Apple in lib/api/apple.ts.

const ROOT_URL = "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer";
// Marker extensions: the App Store receipt signing leaf, and Apple's WWDR intermediate.
const LEAF_OID_HEX = "060a2a864886f76364060b01";
const INTERMEDIATE_OID_HEX = "060a2a864886f76364060201";

export class StoreKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreKitError";
  }
}

let root: Promise<X509Certificate> | null = null;

function appleRoot(): Promise<X509Certificate> {
  root ??= (async () => {
    // Set for tests and offline use: the DER certificate, base64.
    const configured = process.env.APPLE_ROOT_CA_G3?.trim();
    if (configured) return new X509Certificate(Buffer.from(configured, "base64"));
    const response = await fetch(ROOT_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Couldn't load Apple's root certificate: ${response.status}`);
    return new X509Certificate(Buffer.from(await response.arrayBuffer()));
  })().catch((error) => {
    root = null;
    throw error;
  });
  return root;
}

function decodePart(part: string | undefined): Record<string, unknown> {
  if (!part) throw new StoreKitError("Not a signed App Store payload.");
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new StoreKitError("Not a signed App Store payload.");
  }
}

function hasExtension(certificate: X509Certificate, oidHex: string): boolean {
  return certificate.raw.toString("hex").includes(oidHex);
}

function validAt(certificate: X509Certificate, at: Date): boolean {
  return new Date(certificate.validFrom) <= at && at <= new Date(certificate.validTo);
}

// Verifies the signature and certificate chain, then returns the payload.
export async function verifyAppleSigned<T = Record<string, unknown>>(jws: string): Promise<T> {
  const [headerPart, payloadPart, signaturePart] = jws.split(".");
  const header = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3 || !signaturePart) {
    throw new StoreKitError("Not a signed App Store payload.");
  }
  let chain: X509Certificate[];
  try {
    chain = (header.x5c as string[]).map((der) => new X509Certificate(Buffer.from(der, "base64")));
  } catch {
    throw new StoreKitError("The App Store certificates couldn't be read.");
  }
  const [leaf, intermediate, top] = chain as [X509Certificate, X509Certificate, X509Certificate];
  const trusted = await appleRoot();
  if (!top.raw.equals(trusted.raw)) {
    throw new StoreKitError("Not signed by Apple.");
  }
  // Certificates are checked at the time Apple signed the data, as Apple's own library does.
  const signedAt = typeof payload.signedDate === "number" ? new Date(payload.signedDate) : new Date();
  const linked =
    intermediate.checkIssued(top) &&
    intermediate.verify(top.publicKey) &&
    leaf.checkIssued(intermediate) &&
    leaf.verify(intermediate.publicKey) &&
    hasExtension(intermediate, INTERMEDIATE_OID_HEX) &&
    hasExtension(leaf, LEAF_OID_HEX) &&
    chain.every((certificate) => validAt(certificate, signedAt));
  if (!linked) {
    throw new StoreKitError("Not signed by Apple.");
  }
  const signed = verify(
    "sha256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    { dsaEncoding: "ieee-p1363", key: leaf.publicKey },
    Buffer.from(signaturePart, "base64url"),
  );
  if (!signed) {
    throw new StoreKitError("Not signed by Apple.");
  }
  return payload as T;
}

// The fields of a transaction we use (JWSTransactionDecodedPayload).
export type AppleTransaction = {
  appAccountToken?: string;
  bundleId: string;
  environment: "Production" | "Sandbox" | string;
  expiresDate?: number;
  originalTransactionId: string;
  productId: string;
  revocationDate?: number;
  transactionId: string;
};

// The fields of renewal info we use (JWSRenewalInfoDecodedPayload).
export type AppleRenewalInfo = {
  autoRenewStatus?: 0 | 1;
  gracePeriodExpiresDate?: number;
  originalTransactionId: string;
};

// The fields of an App Store Server Notification V2 we use.
export type AppleNotification = {
  data?: {
    bundleId?: string;
    environment?: string;
    signedRenewalInfo?: string;
    signedTransactionInfo?: string;
  };
  notificationType: string;
  notificationUUID: string;
  subtype?: string;
};

export type AppleVerifier = {
  notification: (signedPayload: string) => Promise<AppleNotification>;
  renewalInfo: (jws: string) => Promise<AppleRenewalInfo>;
  transaction: (jws: string) => Promise<AppleTransaction>;
};

export const appleVerifier: AppleVerifier = {
  notification: (signedPayload) => verifyAppleSigned<AppleNotification>(signedPayload),
  renewalInfo: (jws) => verifyAppleSigned<AppleRenewalInfo>(jws),
  transaction: (jws) => verifyAppleSigned<AppleTransaction>(jws),
};

export function appBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || "me.btr.app";
}
