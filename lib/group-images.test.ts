import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupCoverBlobPath } from "./group-images.ts";

describe("group cover blob path", () => {
  it("stores covers under groups/ with a type extension", () => {
    assert.equal(groupCoverBlobPath("abc", "image/jpeg"), "groups/abc/cover.jpg");
    assert.equal(groupCoverBlobPath("abc", "image/png"), "groups/abc/cover.png");
    assert.equal(groupCoverBlobPath("abc", "image/webp"), "groups/abc/cover.webp");
    assert.equal(groupCoverBlobPath("abc", "image/gif"), "groups/abc/cover.gif");
  });
});
