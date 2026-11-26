import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupCoverBlobPath } from "./groups-core.ts";

describe("group cover blob path", () => {
  it("stores each cover under groups/ at its own path, with a type extension", () => {
    assert.equal(groupCoverBlobPath("abc", "image/jpeg", "v1"), "groups/abc/cover-v1.jpg");
    assert.equal(groupCoverBlobPath("abc", "image/png", "v1"), "groups/abc/cover-v1.png");
    assert.equal(groupCoverBlobPath("abc", "image/webp", "v2"), "groups/abc/cover-v2.webp");
    assert.equal(groupCoverBlobPath("abc", "image/gif", "v2"), "groups/abc/cover-v2.gif");
  });
});
