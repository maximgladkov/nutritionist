import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../prisma.ts";
import { getUserFromRequest } from "../session.ts";
import { api, closeDatabase, emails, installFakes, resetDatabase, signIn } from "./test/harness.ts";

before(async () => {
  installFakes();
  await resetDatabase();
});
after(closeDatabase);

describe("email code sign-in", () => {
  it("creates an account and returns tokens plus the profile", async () => {
    const start = await api("POST", "/auth/email/start", { body: { email: "New.Person@Example.com" } });
    assert.equal(start.status, 204);
    const message = emails.at(-1);
    assert.equal(message?.email, "new.person@example.com");
    assert.match(message?.code ?? "", /^\d{6}$/);

    const verified = await api("POST", "/auth/email/verify", {
      body: { code: message?.code, deviceName: "iPhone", email: "new.person@example.com" },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.tokenType, "Bearer");
    assert.equal(verified.body.expiresIn, 900);
    assert.equal(verified.body.user.email, "new.person@example.com");
    assert.deepEqual(verified.body.user.linkedChannels, ["email"]);

    const me = await api("GET", "/me", { token: verified.body.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.id, verified.body.user.id);
  });

  it("signs an existing email into the same account", async () => {
    const first = await signIn("repeat@example.com");
    const second = await signIn("repeat@example.com");
    assert.equal(second.userId, first.userId);
    assert.equal(await prisma.user.count({ where: { email: "repeat@example.com" } }), 1);
  });

  it("rejects a wrong code and locks the code after five attempts", async () => {
    await api("POST", "/auth/email/start", { body: { email: "guess@example.com" } });
    const code = emails.at(-1)?.code ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await api("POST", "/auth/email/verify", { body: { code: wrong, email: "guess@example.com" } });
      assert.equal(result.status, 401);
      assert.equal(result.body.error.code, "unauthorized");
    }
    const locked = await api("POST", "/auth/email/verify", { body: { code, email: "guess@example.com" } });
    assert.equal(locked.status, 401, "the right code no longer works once the attempts are used up");
  });

  it("does not accept a code twice", async () => {
    await api("POST", "/auth/email/start", { body: { email: "once@example.com" } });
    const code = emails.at(-1)?.code;
    const first = await api("POST", "/auth/email/verify", { body: { code, email: "once@example.com" } });
    assert.equal(first.status, 200);
    const second = await api("POST", "/auth/email/verify", { body: { code, email: "once@example.com" } });
    assert.equal(second.status, 401);
  });

  it("rate limits code requests per email", async () => {
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await api("POST", "/auth/email/start", { body: { email: "spam@example.com" } })).status, 204);
    }
    const limited = await api("POST", "/auth/email/start", { body: { email: "spam@example.com" } });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, "too_many_requests");
  });

  it("validates the email and code format", async () => {
    const badEmail = await api("POST", "/auth/email/start", { body: { email: "not-an-email" } });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.body.error.code, "invalid_request");
    const badCode = await api("POST", "/auth/email/verify", { body: { code: "12", email: "a@example.com" } });
    assert.equal(badCode.status, 400);
  });
});

describe("tokens", () => {
  it("requires a valid bearer token on protected routes", async () => {
    assert.equal((await api("GET", "/me")).status, 401);
    const garbage = await api("GET", "/me", { token: "not-a-token" });
    assert.equal(garbage.status, 401);
  });

  it("rotates refresh tokens and revokes every session when an old one is reused", async () => {
    const session = await signIn("rotate@example.com");
    const refreshed = await api("POST", "/auth/refresh", { body: { refreshToken: session.refreshToken } });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.refreshToken, session.refreshToken);
    assert.equal((await api("GET", "/me", { token: refreshed.body.accessToken })).status, 200);

    const reused = await api("POST", "/auth/refresh", { body: { refreshToken: session.refreshToken } });
    assert.equal(reused.status, 401, "a rotated token cannot be used again");
    const afterReuse = await api("POST", "/auth/refresh", { body: { refreshToken: refreshed.body.refreshToken } });
    assert.equal(afterReuse.status, 401, "reuse revokes the newer token too");
  });

  it("logs out by revoking the refresh token", async () => {
    const session = await signIn("logout@example.com");
    assert.equal((await api("POST", "/auth/logout", { body: { refreshToken: session.refreshToken } })).status, 204);
    assert.equal((await api("POST", "/auth/refresh", { body: { refreshToken: session.refreshToken } })).status, 401);
  });

  it("authenticates the eve chat channel with the same bearer token", async () => {
    const session = await signIn("chat@example.com");
    const user = await getUserFromRequest(
      new Request("http://localhost/eve/v1/session", { headers: { authorization: `Bearer ${session.accessToken}` } }),
    );
    assert.equal(user?.id, session.userId);
  });

  it("rejects Telegram init data when the bot is not configured", async () => {
    const result = await api("GET", "/me", { headers: { "x-telegram-init-data": "query_id=1&hash=abc" } });
    assert.equal(result.status, 401);
  });
});

describe("routing", () => {
  it("answers CORS preflight", async () => {
    const result = await api("OPTIONS", "/me");
    assert.equal(result.status, 204);
    assert.equal(result.headers.get("access-control-allow-origin"), "*");
    assert.match(result.headers.get("access-control-allow-headers") ?? "", /authorization/);
  });

  it("returns 404 for unknown endpoints and 405 for the wrong method", async () => {
    const missing = await api("GET", "/nope");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "not_found");
    const wrongMethod = await api("DELETE", "/auth/refresh");
    assert.equal(wrongMethod.status, 405);
  });

  it("rejects bodies that are not JSON", async () => {
    const result = await api("POST", "/auth/email/start", { headers: { "content-type": "application/json" }, raw: "{oops" });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.message, "Send a JSON body.");
  });
});
