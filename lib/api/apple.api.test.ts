import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma } from "../prisma.ts";
import { verifyAppleIdentityToken } from "./apple.ts";
import { api, appleToken, closeDatabase, installFakes, resetDatabase, signIn } from "./test/harness.ts";

before(async () => {
  installFakes();
  await resetDatabase();
});
after(closeDatabase);

async function appleSignIn(identity: Parameters<typeof appleToken>[0], fullName?: string) {
  return api("POST", "/auth/apple", { body: { fullName, identityToken: appleToken(identity) } });
}

describe("Sign in with Apple", () => {
  it("creates an account on first sign-in and reuses it afterwards", async () => {
    const first = await appleSignIn({ email: "kira@icloud.com", emailVerified: true, sub: "apple-1" }, "Kira");
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.user.name, "Kira");
    assert.equal(first.body.user.email, "kira@icloud.com");
    assert.deepEqual(first.body.user.linkedChannels, ["apple", "email"]);

    const again = await appleSignIn({ sub: "apple-1" });
    assert.equal(again.body.user.id, first.body.user.id, "Apple only shares the email the first time");
    assert.equal((await api("GET", "/me", { token: again.body.accessToken })).status, 200);
  });

  it("joins an existing email account when Apple shares the same verified email", async () => {
    const emailUser = await signIn("same@example.com");
    const apple = await appleSignIn({ email: "same@example.com", emailVerified: true, sub: "apple-2" });
    assert.equal(apple.body.user.id, emailUser.userId);
  });

  it("keeps hidden-email Apple IDs as their own account", async () => {
    const relay = await appleSignIn({ email: "x1y2@privaterelay.appleid.com", emailVerified: true, isPrivateEmail: true, sub: "apple-3" });
    assert.equal(relay.status, 200);
    assert.equal(relay.body.user.email, "x1y2@privaterelay.appleid.com");
  });

  it("rejects tokens that fail verification", async () => {
    const result = await api("POST", "/auth/apple", { body: { identityToken: "forged-token-that-is-long-enough" } });
    assert.equal(result.status, 401);
  });
});

describe("linked accounts", () => {
  it("adds Apple to an email account and refuses an Apple ID owned by someone else", async () => {
    const user = await signIn("link-apple@example.com");
    const linked = await api("POST", "/me/linked-channels/apple", { body: { identityToken: appleToken({ sub: "apple-10" }) }, token: user.accessToken });
    assert.equal(linked.status, 201, JSON.stringify(linked.body));
    assert.deepEqual(linked.body.linkedChannels, ["apple", "email"]);

    const other = await signIn("link-other@example.com");
    const taken = await api("POST", "/me/linked-channels/apple", { body: { identityToken: appleToken({ sub: "apple-10" }) }, token: other.accessToken });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error.code, "already_linked");
  });

  it("unlinks chats and keeps at least one way to sign in", async () => {
    const user = await signIn("unlink@example.com");
    await prisma.channelIdentity.create({ data: { provider: "telegram", providerUserId: "tg-55", userId: user.userId } });
    const unlinked = await api("DELETE", "/me/linked-channels/telegram", { token: user.accessToken });
    assert.equal(unlinked.status, 200);
    assert.deepEqual(unlinked.body.linkedChannels, ["email"]);
    assert.equal((await api("DELETE", "/me/linked-channels/telegram", { token: user.accessToken })).status, 404);
    assert.equal((await api("DELETE", "/me/linked-channels/email", { token: user.accessToken })).status, 400);

    const appleOnly = await appleSignIn({ sub: "apple-only" });
    const last = await api("DELETE", "/me/linked-channels/apple", { token: appleOnly.body.accessToken });
    assert.equal(last.status, 409);
    assert.equal(last.body.error.code, "last_sign_in_method");
  });

  it("returns the Telegram bot link with a link code", async () => {
    const user = await signIn("code@example.com");
    const created = await api("POST", "/me/link-codes", { token: user.accessToken });
    assert.match(created.body.code, /^[A-Z0-9]{8}$/);
    assert.ok("telegramBotUrl" in created.body);
  });

  it("deletes the account and everything in it", async () => {
    const user = await signIn("delete-me@example.com");
    await api("POST", "/meals/items", { body: { items: [{ amount: 100, name: "Apple", nutrimentsPer100g: { energyKcal100g: 52 }, unit: "g" }], label: "snack" }, token: user.accessToken });
    assert.equal((await api("DELETE", "/me", { token: user.accessToken })).status, 204);
    assert.equal(await prisma.user.count({ where: { id: user.userId } }), 0);
    assert.equal(await prisma.meal.count({ where: { userId: user.userId } }), 0);
    assert.equal((await api("GET", "/me", { token: user.accessToken })).status, 401);
    assert.equal((await api("POST", "/auth/refresh", { body: { refreshToken: user.refreshToken } })).status, 401);
  });
});

describe("Apple identity token verification", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), alg: "RS256", kid: "test-kid", use: "sig" };
  const realFetch = globalThis.fetch;

  function token(claims: Record<string, unknown>, kid = "test-kid"): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
    return `${header}.${payload}.${signature}`;
  }

  const valid = {
    aud: "host.exp.Exponent",
    email: "Kira@Example.com",
    email_verified: "true",
    exp: Math.floor(Date.now() / 1000) + 600,
    iss: "https://appleid.apple.com",
    sub: "001234.abcd",
  };

  before(() => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it("accepts a correctly signed token for this app", async () => {
    assert.deepEqual(await verifyAppleIdentityToken(token(valid)), {
      email: "kira@example.com",
      emailVerified: true,
      isPrivateEmail: false,
      sub: "001234.abcd",
    });
  });

  it("rejects other apps, expired tokens, other issuers and bad signatures", async () => {
    await assert.rejects(verifyAppleIdentityToken(token({ ...valid, aud: "com.someone.else" })), /another app/);
    await assert.rejects(verifyAppleIdentityToken(token({ ...valid, exp: 1 })), /expired/);
    await assert.rejects(verifyAppleIdentityToken(token({ ...valid, iss: "https://evil.example" })), /issuer/);
    await assert.rejects(verifyAppleIdentityToken(token(valid, "unknown-kid")), /signing key/);
    const tampered = token(valid).split(".");
    tampered[1] = Buffer.from(JSON.stringify({ ...valid, sub: "someone-else" })).toString("base64url");
    await assert.rejects(verifyAppleIdentityToken(tampered.join(".")), /signature/);
  });
});
