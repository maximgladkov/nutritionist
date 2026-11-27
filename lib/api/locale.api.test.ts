import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

let kira: Session;

before(async () => {
  installFakes();
  await resetDatabase();
  kira = await signIn("kira@example.com");
});
after(closeDatabase);

describe("error messages", () => {
  it("follow the app's language when no one is signed in", async () => {
    const spanish = await api("GET", "/me", { headers: { "accept-language": "es" } });
    assert.equal(spanish.status, 401);
    assert.equal(spanish.body.error.code, "unauthorized");
    assert.equal(spanish.body.error.message, "Inicia sesión para continuar.");
    const russian = await api("GET", "/no-such-thing", { headers: { "accept-language": "ru-RU" } });
    assert.equal(russian.body.error.message, "Такого адреса нет.");
    const other = await api("GET", "/me", { headers: { "accept-language": "de" } });
    assert.equal(other.body.error.message, "Sign in to continue.");
  });

  it("keep their status and code, and follow the account's language first", async () => {
    await api("PATCH", "/me", { body: { locale: "ru" }, token: kira.accessToken });
    const result = await api("GET", "/meals/missing", { headers: { "accept-language": "es" }, token: kira.accessToken });
    assert.equal(result.status, 404, JSON.stringify(result.body));
    assert.equal(result.body.error.code, "not_found");
    assert.equal(result.body.error.message, "Приём пищи не найден.");
  });

  it("stay English for messages built from values", async () => {
    const result = await api("PATCH", "/me", { body: { locale: "xx" }, headers: { "accept-language": "es" }, token: kira.accessToken });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.message, "Choose one of: en, ru, es.");
  });
});
