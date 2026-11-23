import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Seals third-party tokens before they are stored, so a database dump alone can't be used to
// read someone's account elsewhere. AES-256-GCM with a key derived from AUTH_SECRET.

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return createHash("sha256").update(`secret-box:${secret}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) {
    throw new Error("Unrecognised sealed secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
