import type { Messages } from "@lingui/core";
import { messages as de } from "../../locales/de/messages";
import { messages as en } from "../../locales/en/messages";
import { messages as es } from "../../locales/es/messages";
import { messages as fr } from "../../locales/fr/messages";
import { messages as it } from "../../locales/it/messages";
import { messages as ru } from "../../locales/ru/messages";
import type { Locale } from "./locales";

export const allMessages: Record<Locale, Messages> = {
  en,
  ru,
  es,
  de,
  fr,
  it,
};
