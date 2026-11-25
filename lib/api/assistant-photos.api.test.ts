import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { generateText, wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  EARLIER_PHOTO_NOTE,
  MISSING_PHOTO_NOTE,
  photoLink,
  photosMiddleware,
  PHOTOS_MAX_BYTES,
  requireOwnPhotos,
  showPhotos,
} from "../assistant/photos.ts";
import { prisma } from "../prisma.ts";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(1)]);

let session: Session;
let other: Session;

beforeEach(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("assistant@example.com");
  other = await signIn("other@example.com");
});
after(closeDatabase);

async function upload(by: Session): Promise<string> {
  const form = new FormData();
  form.append("file", new File([JPEG], "menu.jpg", { type: "image/jpeg" }));
  const { body, status } = await api("POST", "/uploads", { raw: form, token: by.accessToken });
  assert.equal(status, 201, JSON.stringify(body));
  return body.uploadId;
}

const part = (id: string) => ({ data: photoLink(id), mediaType: "image/jpeg", type: "file" as const });
const ask = (text: string) => ({ text, type: "text" as const });

describe("photos sent to the assistant", () => {
  it("only takes the sender's own uploads", async () => {
    const [mine, theirs] = [await upload(session), await upload(other)];
    const app = { channel: "app", userId: session.userId };
    await requireOwnPhotos([ask("Menu"), part(mine)], app);
    await requireOwnPhotos("Hi", app);
    await assert.rejects(requireOwnPhotos([part(mine), part(theirs)], app));
    await assert.rejects(requireOwnPhotos([part(theirs)], { channel: "web", userId: session.userId }));
    await assert.rejects(requireOwnPhotos([{ ...part(mine), data: "https://example.com/a.jpg" }], app));
    await assert.rejects(requireOwnPhotos([{ ...part(mine), data: "data:image/jpeg;base64,AAAA" }], app));
    await requireOwnPhotos([{ ...part(mine), data: "data:image/jpeg;base64,AAAA" }], { channel: "web", userId: session.userId });
    await assert.rejects(requireOwnPhotos(Array.from({ length: 9 }, () => part(mine)), app));
  });

  it("gives the model the photos themselves, in order, through the real message conversion", async () => {
    const ids = [await upload(session), await upload(session)];
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ text: "ok", type: "text" as const }],
        finishReason: { raw: "stop", unified: "stop" as const },
        usage: {
          inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
          outputTokens: { reasoning: 0, text: 1, total: 1 },
        },
        warnings: [],
      }),
      supportedUrls: { "*/*": [/.*/u] },
    });
    await generateText({
      messages: [{ content: [ask("What should I order?"), ...ids.map(part)], role: "user" }],
      model: wrapLanguageModel({ middleware: [{ specificationVersion: "v4" }, photosMiddleware], model }),
    });
    const [sent] = model.doGenerateCalls[0]!.prompt;
    assert.deepEqual(sent!.content.map((row) => (typeof row === "string" ? row : row.type)), ["text", "file", "file"]);
    const file = sent!.content[1] as { data: { data: Uint8Array; type: string }; mediaType: string };
    assert.equal(file.data.type, "data");
    assert.deepEqual([...file.data.data], [...JPEG]);
    assert.equal(file.mediaType, "image/jpeg");
  });

  it("notes a photo it can't open, and stops showing a deleted account's", async () => {
    const id = await upload(session);
    await prisma.userAttachment.update({ data: { userId: null }, where: { id } });
    const [message] = await showPhotos([
      { content: [{ data: { type: "url", url: new URL(photoLink(id)) }, mediaType: "image/jpeg", type: "file" }], role: "user" },
    ]);
    assert.deepEqual(message!.content, [{ text: MISSING_PHOTO_NOTE, type: "text" }]);
  });

  it("keeps the newest message's photos whole and lets older ones go when there's no room", async () => {
    const message = (...names: string[]) => ({
      content: names.map((name) => ({
        data: { type: "url" as const, url: new URL(photoLink(name)) },
        mediaType: "image/jpeg",
        type: "file" as const,
      })),
      role: "user" as const,
    });
    const load = async () => ({ bytes: new Uint8Array(PHOTOS_MAX_BYTES / 3), mediaType: "image/jpeg" });
    const prompt = await showPhotos([message("a"), message("b", "c"), message("d"), message("e")], load);
    const kinds = prompt.map((row) => (row.content as { type: string; text?: string }[]).map((p) => p.text ?? p.type));
    assert.deepEqual(kinds, [[EARLIER_PHOTO_NOTE], [EARLIER_PHOTO_NOTE, EARLIER_PHOTO_NOTE], ["file"], ["file"]]);
    const big = await showPhotos([message("a", "b", "c", "d", "e")], load);
    assert.equal((big[0]!.content as { type: string }[]).filter((p) => p.type === "file").length, 5);
  });

  it("shows them in the conversation with the words that went along", async () => {
    const ids = [await upload(session), await upload(session)];
    await prisma.agentTurn.create({
      data: {
        channel: "app",
        messages: {
          items: [
            {
              at: new Date().toISOString(),
              parts: [ask("What's best for me?"), ...ids.map((id) => ({ filename: "p.jpg", mediaType: "image/jpeg", type: "file", url: photoLink(id) }))],
              text: "What's best for me?\n[file: p.jpg (image/jpeg)]\n[file: p.jpg (image/jpeg)]",
              type: "user",
            },
          ],
          steps: [],
        },
        sessionId: "s1",
        startedAt: new Date(),
        status: "completed",
        turnId: "t1",
        turnSequence: 0,
        userId: session.userId,
      },
    });
    const { body } = await api("GET", "/assistant/conversation", { token: session.accessToken });
    assert.equal(body.turns[0].text, "What's best for me?");
    assert.deepEqual(body.turns[0].photos, ids.map((id) => ({ id, url: `/api/v1/uploads/${id}/content` })));
  });
});
