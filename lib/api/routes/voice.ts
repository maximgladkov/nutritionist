import { APICallError } from "ai";
import { recordAchievementEvent } from "../../achievements/events.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, invalid } from "../errors.ts";
import { json } from "../http.ts";
import type { RouteDefinition } from "../router.ts";

// About five minutes of 16 kHz speech; dictating a meal takes seconds.
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;

// Formats the transcription model accepts, told apart by their first bytes.
function sniffAudioMediaType(head: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(4, 8) === "ftyp") return "audio/mp4";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 3) === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "audio/webm";
  return null;
}

async function readAudio(request: Request): Promise<Uint8Array> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      throw invalid("Attach the recording as a `file` field.");
    }
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Uint8Array(await request.arrayBuffer());
}

// The gateway reports the provider refusing the audio as its own server error, so recognise it by
// the provider's words, anywhere in the cause chain.
const REJECTED_AUDIO = /corrupted or unsupported|does not support the format|audio file/i;

function rejectedAudio(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (APICallError.isInstance(current) && current.statusCode === 400) return true;
    if (current instanceof Error && REJECTED_AUDIO.test(current.message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export const voiceRoutes: RouteDefinition[] = [
  {
    // Turns a voice recording into text, in whatever language was spoken. The audio is not kept.
    async handler({ request, user }) {
      const bytes = await readAudio(request);
      if (bytes.byteLength === 0) {
        throw invalid("The recording is empty.");
      }
      if (bytes.byteLength > AUDIO_MAX_BYTES) {
        throw new ApiError(413, "too_large", "That recording is too long. Keep it under a few minutes.");
      }
      const mediaType = sniffAudioMediaType(bytes.subarray(0, 16));
      if (!mediaType) {
        throw new ApiError(415, "unsupported_media_type", "Send the recording as WAV, M4A, MP3, OGG, FLAC or WebM.");
      }
      try {
        const { language, text } = await apiDeps().transcribe({ bytes, mediaType });
        if (text.trim()) {
          apiDeps().background(() => recordAchievementEvent(user.id, "voice_note"));
        }
        return json({ language, text });
      } catch (error) {
        // The model refuses recordings it can't read (cut off, silent, damaged): say so plainly
        // rather than failing as if the server broke.
        if (rejectedAudio(error)) {
          throw new ApiError(422, "unreadable_audio", "We couldn't make out any speech in that recording.");
        }
        throw error;
      }
    },
    method: "POST",
    path: "/log/transcribe",
  },
];
