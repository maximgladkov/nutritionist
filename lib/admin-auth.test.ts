import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  basicCredentialsEqual,
  isValidAdminBasicAuth,
  parseBasicAuthorization,
} from "./admin-auth.ts";

describe("parseBasicAuthorization", () => {
  it("parses a standard header", () => {
    const token = Buffer.from("admin:s3cret", "utf8").toString("base64");
    assert.deepEqual(parseBasicAuthorization(`Basic ${token}`), {
      password: "s3cret",
      username: "admin",
    });
  });

  it("keeps extra colons in the password", () => {
    const token = Buffer.from("admin:a:b:c", "utf8").toString("base64");
    assert.deepEqual(parseBasicAuthorization(`Basic ${token}`), {
      password: "a:b:c",
      username: "admin",
    });
  });

  it("rejects missing or malformed headers", () => {
    assert.equal(parseBasicAuthorization(null), null);
    assert.equal(parseBasicAuthorization("Bearer abc"), null);
    assert.equal(parseBasicAuthorization("Basic "), null);
    const token = Buffer.from("nocolon", "utf8").toString("base64");
    assert.equal(parseBasicAuthorization(`Basic ${token}`), null);
  });
});

describe("basicCredentialsEqual", () => {
  it("matches equal credentials", () => {
    assert.equal(
      basicCredentialsEqual(
        { password: "pw", username: "admin" },
        { password: "pw", username: "admin" },
      ),
      true,
    );
  });

  it("rejects a wrong password", () => {
    assert.equal(
      basicCredentialsEqual(
        { password: "nope", username: "admin" },
        { password: "pw", username: "admin" },
      ),
      false,
    );
  });
});

describe("isValidAdminBasicAuth", () => {
  it("requires configured env credentials", () => {
    const previousUser = process.env.ADMIN_BASIC_USER;
    const previousPassword = process.env.ADMIN_BASIC_PASSWORD;
    delete process.env.ADMIN_BASIC_USER;
    delete process.env.ADMIN_BASIC_PASSWORD;
    try {
      const token = Buffer.from("admin:pw", "utf8").toString("base64");
      assert.equal(isValidAdminBasicAuth(`Basic ${token}`), false);
      process.env.ADMIN_BASIC_USER = "admin";
      process.env.ADMIN_BASIC_PASSWORD = "pw";
      assert.equal(isValidAdminBasicAuth(`Basic ${token}`), true);
      assert.equal(isValidAdminBasicAuth("Basic " + Buffer.from("admin:wrong").toString("base64")), false);
      assert.equal(isValidAdminBasicAuth(null), false);
    } finally {
      if (previousUser === undefined) {
        delete process.env.ADMIN_BASIC_USER;
      } else {
        process.env.ADMIN_BASIC_USER = previousUser;
      }
      if (previousPassword === undefined) {
        delete process.env.ADMIN_BASIC_PASSWORD;
      } else {
        process.env.ADMIN_BASIC_PASSWORD = previousPassword;
      }
    }
  });
});
