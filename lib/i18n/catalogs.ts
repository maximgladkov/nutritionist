import type { Messages } from "@lingui/core";
import { messages as en } from "../../locales/en/messages";
import { messages as ru } from "../../locales/ru/messages";
import type { Locale } from "./locales";

export const allMessages: Record<Locale, Messages> = {
  en,
  ru,
};
