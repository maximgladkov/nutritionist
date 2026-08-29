import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownToTelegramHtml } from "./telegram-html.ts";

describe("markdownToTelegramHtml", () => {
  it("renders bold, links, and headings", () => {
    assert.equal(
      markdownToTelegramHtml("## Lunch\n**Yogurt** was [logged](https://example.com/s)."),
      "<b>Lunch</b>\n<b>Yogurt</b> was <a href=\"https://example.com/s\">logged</a>.",
    );
  });

  it("keeps code and HTML special characters literal", () => {
    assert.equal(
      markdownToTelegramHtml("Use `a < b` and ```\nfoo & bar\n```"),
      "Use <code>a &lt; b</code> and <pre>foo &amp; bar</pre>",
    );
  });

  it("does not treat product underscores as italic", () => {
    assert.equal(markdownToTelegramHtml("vitamin_d 2g"), "vitamin_d 2g");
  });
});
