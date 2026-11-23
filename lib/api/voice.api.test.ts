import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { api, closeDatabase, installFakes, resetDatabase, signIn, transcriptions, type Session } from "./test/harness.ts";

let session: Session;

// A WAV file: a 44-byte header, then (for the fake transcriber) the words "spoken" in it.
function wav(spoken: string): Uint8Array {
  const header = new Uint8Array(44);
  header.set(new TextEncoder().encode("RIFF"), 0);
  header.set(new TextEncoder().encode("WAVE"), 8);
  const words = new TextEncoder().encode(spoken);
  const out = new Uint8Array(44 + words.length);
  out.set(header, 0);
  out.set(words, 44);
  return out;
}

beforeEach(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("voice@example.com");
});
after(closeDatabase);

describe("voice dictation", () => {
  it("turns a recording into text in the language spoken", async () => {
    const spanish = await api("POST", "/log/transcribe", { raw: wav("Dos huevos fritos"), token: session.accessToken });
    assert.equal(spanish.status, 200, JSON.stringify(spanish.body));
    assert.deepEqual(spanish.body, { language: "spanish", text: "Dos huevos fritos" });

    const form = new FormData();
    form.append("file", new Blob([wav("Two fried eggs")], { type: "audio/wav" }), "dictation.wav");
    const english = await api("POST", "/log/transcribe", { raw: form, token: session.accessToken });
    assert.deepEqual(english.body, { language: "english", text: "Two fried eggs" });
    assert.deepEqual(transcriptions, ["audio/wav", "audio/wav"]);
  });

  it("refuses empty or unknown audio, and anyone signed out", async () => {
    assert.equal((await api("POST", "/log/transcribe", { raw: new Uint8Array(), token: session.accessToken })).status, 400);
    const caf = new TextEncoder().encode("caff\u0000\u0001\u0000\u0000 not a format we take");
    assert.equal((await api("POST", "/log/transcribe", { raw: caf, token: session.accessToken })).status, 415);
    assert.equal((await api("POST", "/log/transcribe", { raw: wav("hi") })).status, 401);
    assert.equal(transcriptions.length, 0);
  });

  it("says plainly when there's no speech it can read", async () => {
    const silent = await api("POST", "/log/transcribe", { raw: wav(""), token: session.accessToken });
    assert.equal(silent.status, 422);
    assert.equal(silent.body.error.code, "unreadable_audio");
  });
});
