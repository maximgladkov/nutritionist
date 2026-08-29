import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { TelegramMessage } from "eve/channels/telegram";
import {
  applyTelegramTranscript,
  telegramAudioFromMessage,
  telegramMessageHasInboundContent,
  transcribeTelegramAudio,
} from "./telegram-audio.ts";

function message(overrides: Partial<TelegramMessage> & { raw?: Record<string, unknown> }): TelegramMessage {
  return {
    attachments: [],
    caption: "",
    chat: { id: "1", type: "private" },
    messageId: "1",
    raw: {},
    text: "",
    ...overrides,
  };
}

describe("telegramAudioFromMessage", () => {
  it("reads a voice note", () => {
    assert.deepEqual(
      telegramAudioFromMessage(
        message({
          raw: { voice: { file_id: "AwACVoice", mime_type: "audio/ogg", duration: 4 } },
        }),
      ),
      { fileId: "AwACVoice", fileName: "voice.ogg", mediaType: "audio/ogg" },
    );
  });

  it("reads an audio file", () => {
    assert.deepEqual(
      telegramAudioFromMessage(
        message({
          raw: {
            audio: { file_id: "CQACAudio", file_name: "meal.mp3", mime_type: "audio/mpeg" },
          },
        }),
      ),
      { fileId: "CQACAudio", fileName: "meal.mp3", mediaType: "audio/mpeg" },
    );
  });

  it("prefers voice over audio when both are present", () => {
    assert.equal(
      telegramAudioFromMessage(
        message({
          raw: {
            audio: { file_id: "CQACAudio" },
            voice: { file_id: "AwACVoice" },
          },
        }),
      )?.fileId,
      "AwACVoice",
    );
  });

  it("ignores photo-only messages", () => {
    assert.equal(
      telegramAudioFromMessage(
        message({
          attachments: [
            { fileId: "AgACPhoto", kind: "photo", fileName: "photo.jpg", mediaType: "image/jpeg" },
          ],
          raw: { photo: [{ file_id: "AgACPhoto" }] },
        }),
      ),
      null,
    );
  });

  it("defaults mime type and filename when Telegram omits them", () => {
    assert.deepEqual(telegramAudioFromMessage(message({ raw: { voice: { file_id: "AwAC" } } })), {
      fileId: "AwAC",
      fileName: "voice.ogg",
      mediaType: "audio/ogg",
    });
    assert.deepEqual(telegramAudioFromMessage(message({ raw: { audio: { file_id: "CQAC" } } })), {
      fileId: "CQAC",
      fileName: "audio.mp3",
      mediaType: "audio/mpeg",
    });
  });
});

describe("telegramMessageHasInboundContent", () => {
  it("treats a voice-only message as dispatchable", () => {
    assert.equal(
      telegramMessageHasInboundContent(message({ raw: { voice: { file_id: "AwACVoice" } } })),
      true,
    );
  });

  it("drops empty messages with no files or audio", () => {
    assert.equal(telegramMessageHasInboundContent(message({ caption: "  ", text: "  " })), false);
  });

  it("keeps text, captions, and photo attachments dispatchable", () => {
    assert.equal(telegramMessageHasInboundContent(message({ text: "yogurt" })), true);
    assert.equal(telegramMessageHasInboundContent(message({ caption: "lunch" })), true);
    assert.equal(
      telegramMessageHasInboundContent(
        message({
          attachments: [{ fileId: "AgACPhoto", kind: "photo" }],
        }),
      ),
      true,
    );
  });
});

describe("applyTelegramTranscript", () => {
  it("uses the transcript as the message text", () => {
    const inbound = message({ raw: { voice: { file_id: "AwACVoice" } } });
    applyTelegramTranscript(inbound, "yogurt and coffee");
    assert.equal(inbound.text, "yogurt and coffee");
  });

  it("keeps caption text above the transcript", () => {
    const inbound = message({ caption: "breakfast", text: "" });
    applyTelegramTranscript(inbound, "oats with milk");
    assert.equal(inbound.text, "breakfast\noats with milk");
  });

  it("keeps typed text above the transcript", () => {
    const inbound = message({ text: "also log this" });
    applyTelegramTranscript(inbound, "two eggs");
    assert.equal(inbound.text, "also log this\ntwo eggs");
  });
});

describe("transcribeTelegramAudio", () => {
  it("downloads the telegram file and returns trimmed speech text", async () => {
    const bytes = Buffer.from("ogg-bytes");
    const fetchFile = mock.fn(async (url: string) => {
      assert.match(url, /^telegram-file:AwACVoice/);
      assert.match(url, /filename=voice\.ogg/);
      assert.match(url, /mediaType=audio%2Fogg/);
      return { bytes, mediaType: "audio/ogg" };
    });
    const transcribeBytes = mock.fn(async (audio: Buffer) => {
      assert.equal(audio, bytes);
      return "  yogurt  ";
    });

    const transcript = await transcribeTelegramAudio(
      fetchFile,
      { fileId: "AwACVoice", fileName: "voice.ogg", mediaType: "audio/ogg" },
      transcribeBytes,
    );

    assert.equal(transcript, "yogurt");
    assert.equal(fetchFile.mock.callCount(), 1);
    assert.equal(transcribeBytes.mock.callCount(), 1);
  });

  it("returns null when fetch or transcription fails", async () => {
    assert.equal(
      await transcribeTelegramAudio(async () => null, {
        fileId: "missing",
        fileName: "voice.ogg",
        mediaType: "audio/ogg",
      }),
      null,
    );
    assert.equal(
      await transcribeTelegramAudio(
        async () => ({ bytes: Buffer.from("ogg"), mediaType: "audio/ogg" }),
        { fileId: "AwACVoice", fileName: "voice.ogg", mediaType: "audio/ogg" },
        async () => {
          throw new Error("stt failed");
        },
      ),
      null,
    );
    assert.equal(
      await transcribeTelegramAudio(
        async () => ({ bytes: Buffer.from("ogg"), mediaType: "audio/ogg" }),
        { fileId: "AwACVoice", fileName: "voice.ogg", mediaType: "audio/ogg" },
        async () => "   ",
      ),
      null,
    );
  });
});
