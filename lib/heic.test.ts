import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareImageFiles } from "./heic.ts";

describe("prepareImageFiles", () => {
  it("leaves jpeg files unchanged", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "meal.jpg", {
      type: "image/jpeg",
    });
    const [out] = await prepareImageFiles([file]);
    assert.equal(out, file);
  });

  it("leaves png files unchanged", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "label.png", {
      type: "image/png",
    });
    const [out] = await prepareImageFiles([file]);
    assert.equal(out, file);
  });
});
