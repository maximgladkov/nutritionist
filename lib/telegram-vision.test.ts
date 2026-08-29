import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isImageMediaType, looksLikeImageFilename, sniffImageMediaType } from "./image-bytes.ts";
import {
  attachTelegramVision,
  inlineTelegramImages,
  isAudioMediaType,
  isVideoMediaType,
  looksLikeAudioFilename,
  looksLikeVideoFilename,
  withSniffedImageType,
} from "./telegram-vision.ts";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("sniffImageMediaType", () => {
  it("recognizes jpeg, png, gif, and webp", () => {
    assert.equal(sniffImageMediaType(jpeg), "image/jpeg");
    assert.equal(sniffImageMediaType(png), "image/png");
    assert.equal(sniffImageMediaType(Buffer.from("GIF89a")), "image/gif");
    assert.equal(
      sniffImageMediaType(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
      "image/webp",
    );
    assert.equal(sniffImageMediaType(Buffer.from("%PDF-1.4")), null);
  });
});

describe("image filename and media type helpers", () => {
  it("accepts specific image types and common extensions", () => {
    assert.equal(isImageMediaType("image/jpeg"), true);
    assert.equal(isImageMediaType("application/octet-stream"), false);
    assert.equal(looksLikeImageFilename("photo.jpg"), true);
    assert.equal(looksLikeImageFilename("label.pdf"), false);
  });

  it("accepts audio and video types used by Telegram", () => {
    assert.equal(isAudioMediaType("audio/ogg"), true);
    assert.equal(isAudioMediaType("audio/*"), false);
    assert.equal(looksLikeAudioFilename("voice.ogg"), true);
    assert.equal(isVideoMediaType("video/mp4"), true);
    assert.equal(looksLikeVideoFilename("plate.mp4"), true);
    assert.equal(looksLikeVideoFilename("voice.ogg"), false);
  });
});

describe("withSniffedImageType", () => {
  it("replaces octet-stream with the sniffed image type", () => {
    assert.deepEqual(withSniffedImageType({ bytes: jpeg, mediaType: "application/octet-stream" }), {
      bytes: jpeg,
      mediaType: "image/jpeg",
    });
  });

  it("keeps an existing specific image type", () => {
    assert.deepEqual(withSniffedImageType({ bytes: jpeg, mediaType: "image/jpeg" }), {
      bytes: jpeg,
      mediaType: "image/jpeg",
    });
  });
});

describe("inlineTelegramImages", () => {
  it("converts telegram file parts into inline image file parts", async () => {
    const url = "telegram-file:AgACAgIAphoto?filename=photo.jpg&mediaType=image%2Fjpeg";
    const content = await inlineTelegramImages(
      [
        { type: "text", text: "Add 100 ml" },
        { type: "file", mediaType: "image/jpeg", filename: "photo.jpg", data: `eve-url:${url}` },
      ],
      async (requested) => {
        assert.equal(requested, url);
        return { bytes: jpeg, mediaType: "application/octet-stream" };
      },
    );

    assert.deepEqual(content, [
      { type: "text", text: "Add 100 ml" },
      {
        type: "file",
        mediaType: "image/jpeg",
        filename: "photo.jpg",
        data: { type: "data", data: jpeg.toString("base64") },
      },
    ]);
  });

  it("leaves pdf file parts unchanged", async () => {
    const part = {
      type: "file" as const,
      mediaType: "application/pdf",
      filename: "label.pdf",
      data: "eve-url:telegram-file:file-pdf",
    };
    const content = await inlineTelegramImages([part], async () => {
      throw new Error("should not fetch pdf");
    });
    assert.deepEqual(content, [part]);
  });

  it("keeps the file part when fetch fails", async () => {
    const part = {
      type: "file" as const,
      mediaType: "image/jpeg",
      filename: "photo.jpg",
      data: "telegram-file:missing",
    };
    const content = await inlineTelegramImages([part], async () => {
      throw new Error("unavailable");
    });
    assert.deepEqual(content, [part]);
  });

  it("inlines images on channel deliver before the harness stages files", async () => {
    const channel = {
      adapter: {
        async deliver(payload: Record<string, unknown>) {
          return payload;
        },
        async fetchFile() {
          return { bytes: jpeg, mediaType: "application/octet-stream" };
        },
      },
    };

    attachTelegramVision(channel, async () => null);
    const result = await channel.adapter.deliver(
      {
        message: [
          {
            type: "file",
            mediaType: "image/jpeg",
            filename: "photo.jpg",
            data: "telegram-file:AgACAgIAphoto",
          },
        ],
      },
      {},
    );

    const message = (result as { message: Array<{ type: string; data?: { type: string } }> }).message[0];
    assert.equal(message?.type, "file");
    assert.equal(message?.data?.type, "data");
  });

  it("emits JSON-serializable file parts so eve can snapshot the turn", async () => {
    const content = await inlineTelegramImages(
      [
        {
          type: "file",
          mediaType: "image/jpeg",
          filename: "photo.jpg",
          data: "telegram-file:AgACAgIAphoto",
        },
      ],
      async () => ({ bytes: jpeg, mediaType: "image/jpeg" }),
    );

    assert.deepEqual(JSON.parse(JSON.stringify(content)), content);
    assert.equal(isJsonValue(content), true);
  });

  it("inlines telegram audio and video file parts", async () => {
    const ogg = Buffer.from("ogg-bytes");
    const mp4 = Buffer.from("mp4-bytes");
    const content = await inlineTelegramImages(
      [
        { type: "file", mediaType: "audio/ogg", filename: "voice.ogg", data: "telegram-file:AwACVoice" },
        { type: "file", mediaType: "video/mp4", filename: "plate.mp4", data: "telegram-file:BAACVideo" },
      ],
      async (url) => {
        if (url.includes("AwACVoice")) {
          return { bytes: ogg, mediaType: "audio/ogg" };
        }
        return { bytes: mp4, mediaType: "video/mp4" };
      },
    );

    assert.deepEqual(content, [
      {
        type: "file",
        mediaType: "audio/ogg",
        filename: "voice.ogg",
        data: { type: "data", data: ogg.toString("base64") },
      },
      {
        type: "file",
        mediaType: "video/mp4",
        filename: "plate.mp4",
        data: { type: "data", data: mp4.toString("base64") },
      },
    ]);
  });
});

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) {
    return false;
  }
  return Object.values(value).every((entry) => entry === undefined || isJsonValue(entry));
}
