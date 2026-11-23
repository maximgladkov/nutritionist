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

export const voiceRoutes: RouteDefinition[] = [
  {
    // Turns a voice recording into text, in whatever language was spoken. The audio is not kept.
    async handler({ request }) {
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
      const { language, text } = await apiDeps().transcribe({ bytes, mediaType });
      return json({ language, text });
    },
    method: "POST",
    path: "/log/transcribe",
  },
];
