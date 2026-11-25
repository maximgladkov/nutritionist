import { z } from "zod";
import { prisma } from "../prisma.ts";

// What someone has chosen for their coach; kept with the app's other preferences.
export const HOME_TOPICS = ["ideas", "progress", "cheer", "reminders"] as const;
export type HomeTopic = (typeof HOME_TOPICS)[number];
export const TONES = ["friendly", "direct", "playful", "calm"] as const;
export type Tone = (typeof TONES)[number];

// OpenAI's GPT-Live voices.
export const VOICES = [
  "marin", "gleam", "meridian", "halo", "vesper", "willow", "stone", "pearl", "ripple", "delta",
  "luciernaga", "destello", "calandria", "compas", "nuri", "flitz", "brise", "sillage", "bossa", "tempo",
] as const;
export type Voice = (typeof VOICES)[number];
export const DEFAULT_VOICE: Voice = "marin";

export const LANGUAGES = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  uk: "Ukrainian",
} as const;
export type Language = keyof typeof LANGUAGES;

const languageSchema = z.enum(["auto", ...(Object.keys(LANGUAGES) as [Language, ...Language[]])]);

export const assistantSettingsSchema = z
  .object({
    homeMessages: z.boolean(),
    homeTopics: z.array(z.enum(HOME_TOPICS)).max(HOME_TOPICS.length),
    language: languageSchema,
    tone: z.enum(TONES),
    voice: z.enum(VOICES),
  })
  .partial()
  .strict();

export type AssistantSettings = Required<z.infer<typeof assistantSettingsSchema>>;

export const DEFAULT_SETTINGS: AssistantSettings = {
  homeMessages: true,
  homeTopics: [...HOME_TOPICS],
  language: "auto",
  tone: "friendly",
  voice: DEFAULT_VOICE,
};

export function readSettings(preferences: unknown): AssistantSettings {
  const stored = (preferences as { assistant?: unknown } | null)?.assistant;
  const parsed = assistantSettingsSchema.safeParse(stored ?? {});
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export async function loadSettings(userId: string): Promise<AssistantSettings> {
  const profile = await prisma.userProfile.findUnique({ select: { preferences: true }, where: { userId } });
  return readSettings(profile?.preferences);
}

const TONE_LINES: Record<Tone, string> = {
  calm: "Be calm and unhurried: gentle, reassuring, few words, nothing exclamatory.",
  direct: "Be direct: lead with the point, no small talk or cheering, plain short sentences. Still kind.",
  friendly: "Be warm and friendly, like a supportive friend.",
  playful: "Be playful: light humour and a bit of wit, never at their expense or about their body.",
};

export function toneLine(tone: Tone): string {
  return TONE_LINES[tone];
}

// The language they chose, in English; null when it follows what they write.
export function chosenLanguage(settings: AssistantSettings): string | null {
  return settings.language === "auto" ? null : LANGUAGES[settings.language];
}

// Read back on every model call; see appendAppLanguageReminder.
export const LANGUAGE_HEADING = "Reply language chosen in the app's settings:";

export function settingsInstructions(settings: AssistantSettings): string {
  const language = chosenLanguage(settings);
  return [
    `# How they want you to be\n\n${toneLine(settings.tone)}`,
    ...(language ? [`${LANGUAGE_HEADING} ${language}. Always reply in it, whatever language they write in.`] : []),
  ].join("\n\n");
}

export function talkSettingsLines(settings: AssistantSettings): string[] {
  const language = chosenLanguage(settings);
  return [toneLine(settings.tone), ...(language ? [`Always speak ${language}, whatever language they speak.`] : [])];
}
