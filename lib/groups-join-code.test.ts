import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateJoinCode, joinCodePrefix, normalizeJoinCode } from "./groups-join-code.ts";

describe("group join codes", () => {
  it("builds a prefix from the group name", () => {
    assert.equal(joinCodePrefix("Lean by Spring"), "LEAN");
    assert.equal(joinCodePrefix("Él año"), "ELAN");
    assert.equal(joinCodePrefix("42 🏃"), "BTR");
  });

  it("generates codes that normalize to themselves", () => {
    const code = generateJoinCode("Sunday Long Run");
    assert.match(code, /^SUND-[2-9A-HJKMNP-Z]{4}$/u);
    assert.equal(normalizeJoinCode(code), code);
  });

  it("accepts typed variants and rejects junk", () => {
    assert.equal(normalizeJoinCode(" lean 7k2p "), "LEAN-7K2P");
    assert.equal(normalizeJoinCode("lean-7k2p"), "LEAN-7K2P");
    assert.equal(normalizeJoinCode("abc"), null);
    assert.equal(normalizeJoinCode("ABCDEFGHIJKLMNOP"), null);
  });
});
