import type { Messages } from "@lingui/core";
import { messages as de } from "../../locales/de/messages";
import { messages as en } from "../../locales/en/messages";
import { messages as es } from "../../locales/es/messages";
import { messages as fr } from "../../locales/fr/messages";
import { messages as it } from "../../locales/it/messages";
import { messages as ja } from "../../locales/ja/messages";
import { messages as ko } from "../../locales/ko/messages";
import { messages as nl } from "../../locales/nl/messages";
import { messages as pl } from "../../locales/pl/messages";
import { messages as pt } from "../../locales/pt/messages";
import { messages as ru } from "../../locales/ru/messages";
import { messages as tr } from "../../locales/tr/messages";
import { messages as uk } from "../../locales/uk/messages";
import type { Locale } from "./locales";

export const allMessages: Record<Locale, Messages> = {
  en,
  ru,
  es,
  de,
  fr,
  it,
  pt,
  nl,
  pl,
  tr,
  uk,
  ja,
  ko,
};
