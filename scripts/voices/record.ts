import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// Run by hand with the gateway key: has each of the live voices say one line, and keeps those that did
// as public/voice-samples/<voice>.wav, with a report. Costs a few seconds of live audio per voice.
//
//   node --experimental-strip-types scripts/voices/record.ts [voice ...]

const TALK_MODEL = "openai/gpt-live-1";
const SECRETS_URL = "https://ai-gateway.vercel.sh/v1/realtime/client-secrets";
const TALK_WEBSOCKET_URL = "wss://ai-gateway.vercel.sh/v1/live/sessions";

// OpenAI's GPT-Live voices.
const VOICES = [
  "marin", "gleam", "meridian", "halo", "vesper", "willow", "stone", "pearl", "quartz", "ripple", "delta", "cinder", "beacon",
  "luciernaga", "destello", "calandria", "compas", "hornero", "nuri", "juni", "flitz", "brise", "sillage", "bossa", "tempo",
  "nira", "harema", "shida", "noeul",
] as const;
type Voice = (typeof VOICES)[number];

const RATE = 24_000;
const CHUNK_MS = 100;
const START_TIMEOUT_MS = 10_000;
const MAX_MS = 14_000;
// Quiet for this long after speaking means it has finished.
const QUIET_MS = 1_100;
// Shorter than this isn't the sentence.
const MIN_SPEECH_MS = 900;
const LOUD = 500;
const KEEP_MS = 150;

const ENGLISH = "Hi, I'm your personal coach. So, what are we eating today?";
const LINES: Partial<Record<Voice, string>> = {
  bossa: "Oi, eu sou seu coach pessoal. Então, o que vamos comer hoje?",
  brise: "Bonjour, je suis votre coach. Alors, qu'est-ce qu'on mange aujourd'hui ?",
  calandria: "Hola, soy tu coach personal. ¿Qué comemos hoy?",
  compas: "Hola, soy tu coach personal. ¿Qué comemos hoy?",
  destello: "Hola, soy tu coach personal. ¿Qué comemos hoy?",
  flitz: "Hallo, ich bin dein persönlicher Coach. Und, was essen wir heute?",
  luciernaga: "Hola, soy tu coach personal. ¿Qué comemos hoy?",
  nuri: "Hallo, ich bin dein persönlicher Coach. Und, was essen wir heute?",
  sillage: "Bonjour, je suis votre coach. Alors, qu'est-ce qu'on mange aujourd'hui ?",
  harema: "こんにちは、あなたのコーチです。今日は何を食べますか？",
  hornero: "Hola, soy tu coach personal. ¿Qué comemos hoy?",
  juni: "Hallo, ich bin dein persönlicher Coach. Und, was essen wir heute?",
  nira: "नमस्ते, मैं आपका कोच हूँ। तो, आज हम क्या खा रहे हैं?",
  noeul: "안녕하세요, 당신의 코치예요. 오늘은 뭘 먹을까요?",
  shida: "こんにちは、あなたのコーチです。今日は何を食べますか？",
  tempo: "Oi, eu sou seu coach pessoal. Então, o que vamos comer hoje?",
};

function isLoud(pcm: Buffer): boolean {
  for (let at = 0; at + 1 < pcm.length; at += 2) if (Math.abs(pcm.readInt16LE(at)) > LOUD) return true;
  return false;
}

// Without the silence before and after.
function trimPcm(pcm: Buffer): Buffer {
  let first = -1;
  let last = -1;
  for (let at = 0; at + 1 < pcm.length; at += 2) {
    if (Math.abs(pcm.readInt16LE(at)) <= LOUD) continue;
    if (first < 0) first = at;
    last = at;
  }
  if (first < 0) return Buffer.alloc(0);
  const keep = Math.round((RATE * KEEP_MS) / 1000) * 2;
  return pcm.subarray(Math.max(0, first - keep), Math.min(pcm.length - (pcm.length % 2), last + 2 + keep));
}

function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

type Result = { errors: string[]; said: string; speechMs: number; voice: Voice; wav: Buffer | null };

// Has the voice say its line, with nobody on the other end.
async function recordSample({ token, voice }: { token: string; voice: Voice }): Promise<Result> {
  const line = LINES[voice] ?? ENGLISH;
  const order = `Immediately say the following, exactly and in full, then stay silent: "${line}"`;
  const socket = new WebSocket(TALK_WEBSOCKET_URL, ["ai-gateway-realtime.v1", `ai-gateway-auth.${token}`]);
  return new Promise((resolve) => {
    const heard: Buffer[] = [];
    const errors: string[] = [];
    let said = "";
    let bytes = 0;
    let lastLoudByte = -1;
    let done = false;
    let feeding: ReturnType<typeof setInterval> | undefined;
    const send = (event: object) => {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        finish();
      }
    };
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(feeding);
      clearTimeout(starting);
      clearTimeout(ending);
      try {
        socket.send(JSON.stringify({ type: "session.close" }));
        socket.close();
      } catch {
        // Already closed.
      }
      const speech = trimPcm(Buffer.concat(heard));
      const speechMs = Math.round((speech.length / (RATE * 2)) * 1000);
      resolve({ errors, said: said.trim(), speechMs, voice, wav: speechMs >= MIN_SPEECH_MS ? wav(speech) : null });
    };
    const starting = setTimeout(() => {
      errors.push("never started");
      finish();
    }, START_TIMEOUT_MS);
    let ending: ReturnType<typeof setTimeout> | undefined;

    socket.addEventListener("open", () =>
      send({
        session: {
          audio: { format: { rate: RATE, type: "audio/pcm" }, output: { voice } },
          delegation: { type: "client" },
          instructions: "You record one line of speech. Nobody will answer. Never say anything else.",
          model: TALK_MODEL,
          store: false,
        },
        type: "session.start",
      }),
    );
    socket.addEventListener("close", ({ code, reason }) => {
      if (!done && code !== 1000) errors.push(`closed ${code} ${reason}`.trim());
      finish();
    });
    socket.addEventListener("error", () => {
      if (!done) errors.push("connection error");
      finish();
    });
    socket.addEventListener("message", ({ data }: MessageEvent) => {
      let event: { delta?: string; error?: { message?: string }; type?: string };
      try {
        event = JSON.parse(typeof data === "string" ? data : Buffer.from(data as ArrayBuffer).toString("utf8"));
      } catch {
        return;
      }
      if (event.type === "session.started") {
        clearTimeout(starting);
        ending = setTimeout(finish, MAX_MS);
        send({ content: order, delegation_id: null, type: "session.instructions.append" });
        // It listens all along, so it's given a quiet room.
        const silence = Buffer.alloc((RATE * 2 * CHUNK_MS) / 1000).toString("base64");
        feeding = setInterval(() => send({ audio: silence, type: "session.input_audio.append" }), CHUNK_MS);
      } else if (event.type === "session.output_audio.delta" && event.delta) {
        const pcm = Buffer.from(event.delta, "base64");
        heard.push(pcm);
        bytes += pcm.length;
        if (isLoud(pcm)) lastLoudByte = bytes;
        else if (lastLoudByte >= 0 && ((bytes - lastLoudByte) / (RATE * 2)) * 1000 >= QUIET_MS) finish();
      } else if (event.type === "error") {
        errors.push(event.error?.message ?? "error");
      } else if (event.type === "session.output_transcript.delta" && event.delta) {
        said += event.delta;
      } else if (event.type === "session.closed") {
        finish();
      }
    });
  });
}

// Typed or pasted, never shown or kept.
async function askKey(): Promise<string> {
  const given = process.env.AI_GATEWAY_API_KEY?.trim();
  if (given) return given;
  const prompt = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write("Paste the AI Gateway key and press Return. It will not be shown.\n");
  Object.assign(prompt, { _writeToOutput: () => undefined });
  return new Promise((resolve) => prompt.question("", (key) => {
    prompt.close();
    process.stdout.write("\n");
    resolve(key.trim());
  }));
}

async function mint(key: string): Promise<string> {
  const response = await fetch(SECRETS_URL, {
    body: JSON.stringify({ model: TALK_MODEL, routeKind: "live" }),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`The gateway refused: ${response.status}`);
  return ((await response.json()) as { token: string }).token;
}

const asked = process.argv.slice(2);
const voices = VOICES.filter((voice) => asked.length === 0 || asked.includes(voice));
const key = await askKey();
const out = new URL("../../public/voice-samples/", import.meta.url);
mkdirSync(out, { recursive: true });
const report: Omit<Result, "wav">[] = [];
for (const voice of voices) {
  let result: Result;
  try {
    result = await recordSample({ token: await mint(key), voice });
  } catch (error) {
    result = { errors: [(error as Error).message], said: "", speechMs: 0, voice, wav: null };
  }
  const { wav: recording, ...rest } = result;
  const file = new URL(`${voice}.wav`, out);
  if (recording) writeFileSync(file, recording);
  else rmSync(file, { force: true });
  report.push(rest);
  console.log(recording ? "ok  " : "FAIL", voice.padEnd(11), `${rest.speechMs} ms`.padEnd(8), rest.said || "-", rest.errors.join("; "));
  // A gateway that refuses the key refuses every voice.
  if (rest.errors.some((error) => error.includes("refused: 401") || error.includes("refused: 403"))) break;
}
writeFileSync(new URL("report.json", out), JSON.stringify(report, null, 2));
console.log(`${report.filter((row) => row.speechMs >= MIN_SPEECH_MS).length} of ${voices.length} voices recorded.`);
process.exit(0);
