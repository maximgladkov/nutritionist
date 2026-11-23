import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FatSecretError, signFatSecretRequest } from "./fatsecret.ts";

describe("FatSecret client", () => {
  it("recognises FatSecret's per-user rate limit", () => {
    assert.equal(new FatSecretError("User is performing too many actions: please try again later").rateLimited, true);
    assert.equal(new FatSecretError("Invalid ID: please check your food_id", 106).rateLimited, false);
  });

  it("signs requests deterministically with HMAC-SHA1", () => {
    const input = {
      consumerKey: "key",
      consumerSecret: "secret",
      method: "POST" as const,
      nonce: "nonce",
      params: { format: "json", method: "food_entries.get" },
      timestamp: "1700000000",
      tokenSecret: "token-secret",
      url: "https://platform.fatsecret.com/rest/server.api",
    };
    const first = signFatSecretRequest(input);
    assert.equal(first.oauth_signature, signFatSecretRequest(input).oauth_signature);
    assert.notEqual(first.oauth_signature, signFatSecretRequest({ ...input, tokenSecret: "other" }).oauth_signature);
    assert.equal(first.oauth_signature_method, "HMAC-SHA1");
  });
});
