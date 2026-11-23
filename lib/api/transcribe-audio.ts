import { gateway, transcribe } from "ai";
import type { AudioTranscriber } from "./deps.ts";

// Multilingual and picks the language from the audio itself, so people can dictate in whatever
// language they think in, even switching mid-sentence.
export const TRANSCRIPTION_MODEL = "openai/gpt-4o-transcribe";

export const transcribeWithGateway: AudioTranscriber = async ({ bytes }) => {
  const result = await transcribe({
    abortSignal: AbortSignal.timeout(30_000),
    audio: bytes,
    model: gateway.transcriptionModel(TRANSCRIPTION_MODEL),
  });
  return { language: result.language ?? null, text: result.text.trim() };
};
