import type { GroupShareKind } from "./groups.ts";
import { formatNumber, isLocale, pluralForm, type Locale } from "./i18n/locales.ts";
import { prisma } from "./prisma.ts";

// Words the server sends people outside a request: push notifications and the FatSecret import
// report. A push goes to someone else's phone, so it's in their account language, not the sender's.

export type ImportCounts = { days: number; entries: number; weights: number };

type PushCopy = {
  // When the coach has no name yet.
  yourCoach: string;
  // "Elena also asks to see your weight and meal photos. Open the group to allow it."
  shareAsk: (who: string, kinds: readonly GroupShareKind[]) => string;
  // "(+2 more)" after a coach's first comment.
  moreComments: (count: number) => string;
  commented: (who: string, count: number) => string;
  reviewed: (who: string, reacted: boolean) => string;
  fatSecret: { done: string; failed: string; failedTitle: string; report: (counts: ImportCounts) => string };
};

const n = (locale: Locale) => (value: number) => formatNumber(locale, value);

function joined(items: readonly string[], and: string): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;
}

const en: PushCopy = {
  commented: (who, count) => `${who} left ${count === 1 ? "a comment" : `${count} comments`} on your day.`,
  fatSecret: {
    done: "FatSecret import done",
    failed: "The FatSecret import stopped before it finished. Open Connections to try again.",
    failedTitle: "FatSecret import stopped",
    report: ({ days, entries, weights }) => {
      const p = (count: number, one: string, many: string) => `${n("en")(count)} ${count === 1 ? one : many}`;
      if (entries === 0 && weights === 0) return "Nothing new to bring over from FatSecret.";
      const parts = [];
      if (entries > 0) parts.push(`${p(entries, "food", "foods")} across ${p(days, "day", "days")}`);
      if (weights > 0) parts.push(p(weights, "weigh-in", "weigh-ins"));
      return `Imported ${parts.join(" and ")}.`;
    },
  },
  moreComments: (count) => ` (+${count} more)`,
  reviewed: (who, reacted) => `${who} reviewed your day${reacted ? " and reacted to it" : ""}.`,
  shareAsk: (who, kinds) => {
    const names: Record<GroupShareKind, string> = {
      activity: "activity",
      meals: "meal items",
      photos: "meal photos",
      summary: "daily summary",
      weight: "weight",
    };
    return `${who} also asks to see your ${kinds.map((kind) => names[kind]).join(", ")}. Open the group to allow it.`;
  },
  yourCoach: "Your coach",
};

const ru: PushCopy = {
  commented: (who, count) =>
    `${who}: ${n("ru")(count)} ${pluralForm("ru", count, { few: "комментария", many: "комментариев", one: "комментарий", other: "комментария" })} к вашему дню.`,
  fatSecret: {
    done: "Импорт из FatSecret завершён",
    failed: "Импорт из FatSecret остановился, не закончив. Откройте «Подключения», чтобы попробовать снова.",
    failedTitle: "Импорт из FatSecret остановлен",
    report: ({ days, entries, weights }) => {
      const p = (count: number, forms: { one: string; few: string; many: string }) =>
        `${n("ru")(count)} ${pluralForm("ru", count, { ...forms, other: forms.few })}`;
      if (entries === 0 && weights === 0) return "В FatSecret нет ничего нового для переноса.";
      const parts = [];
      if (entries > 0)
        parts.push(
          `${p(entries, { few: "продукта", many: "продуктов", one: "продукт" })} за ${p(days, { few: "дня", many: "дней", one: "день" })}`,
        );
      if (weights > 0) parts.push(p(weights, { few: "взвешивания", many: "взвешиваний", one: "взвешивание" }));
      return `Перенесено: ${parts.join(" и ")}.`;
    },
  },
  moreComments: (count) => ` (+${count})`,
  reviewed: (who, reacted) => `День проверен · ${who}${reacted ? ", есть реакция" : ""}.`,
  shareAsk: (who, kinds) => {
    const names: Record<GroupShareKind, string> = {
      activity: "активность",
      meals: "продукты в приёмах пищи",
      photos: "фото еды",
      summary: "сводку дня",
      weight: "вес",
    };
    return `${who} также просит показать ${joined(kinds.map((kind) => names[kind]), "и")}. Откройте группу, чтобы разрешить.`;
  },
  yourCoach: "Ваш коуч",
};

const es: PushCopy = {
  commented: (who, count) =>
    count === 1 ? `${who} dejó un comentario sobre tu día.` : `${who} dejó ${n("es")(count)} comentarios sobre tu día.`,
  fatSecret: {
    done: "Importación de FatSecret lista",
    failed: "La importación de FatSecret se detuvo antes de terminar. Abre Conexiones para volver a intentarlo.",
    failedTitle: "Importación de FatSecret detenida",
    report: ({ days, entries, weights }) => {
      const p = (count: number, one: string, other: string) => `${n("es")(count)} ${pluralForm("es", count, { one, other })}`;
      if (entries === 0 && weights === 0) return "No hay nada nuevo que traer de FatSecret.";
      const parts = [];
      if (entries > 0) parts.push(`${p(entries, "alimento", "alimentos")} de ${p(days, "día", "días")}`);
      if (weights > 0) parts.push(p(weights, "pesaje", "pesajes"));
      return `Se importaron ${parts.join(" y ")}.`;
    },
  },
  moreComments: (count) => ` (+${count} más)`,
  reviewed: (who, reacted) => `${who} revisó tu día${reacted ? " y reaccionó" : ""}.`,
  shareAsk: (who, kinds) => {
    const names: Record<GroupShareKind, string> = {
      activity: "actividad",
      meals: "alimentos de cada comida",
      photos: "fotos de comidas",
      summary: "resumen del día",
      weight: "peso",
    };
    return `${who} también quiere ver: ${joined(kinds.map((kind) => names[kind]), "y")}. Abre el grupo para permitirlo.`;
  },
  yourCoach: "Tu coach",
};

const de: PushCopy = {
  commented: (who, count) =>
    count === 1 ? `${who} hat deinen Tag kommentiert.` : `${who} hat ${n("de")(count)} Kommentare zu deinem Tag geschrieben.`,
  fatSecret: {
    done: "FatSecret-Import fertig",
    failed: "Der FatSecret-Import wurde vor dem Ende gestoppt. Öffne „Verbindungen“, um es erneut zu versuchen.",
    failedTitle: "FatSecret-Import gestoppt",
    report: ({ days, entries, weights }) => {
      const p = (count: number, one: string, other: string) => `${n("de")(count)} ${pluralForm("de", count, { one, other })}`;
      if (entries === 0 && weights === 0) return "Bei FatSecret gibt es nichts Neues zu übernehmen.";
      const parts = [];
      if (entries > 0) parts.push(`${p(entries, "Lebensmittel", "Lebensmittel")} aus ${p(days, "Tag", "Tagen")}`);
      if (weights > 0) parts.push(p(weights, "Wiegung", "Wiegungen"));
      return `Importiert: ${parts.join(" und ")}.`;
    },
  },
  moreComments: (count) => ` (+${count} weitere)`,
  reviewed: (who, reacted) => `${who} hat deinen Tag durchgesehen${reacted ? " und reagiert" : ""}.`,
  shareAsk: (who, kinds) => {
    const names: Record<GroupShareKind, string> = {
      activity: "Aktivität",
      meals: "einzelne Lebensmittel",
      photos: "Mahlzeitenfotos",
      summary: "Tagesübersicht",
      weight: "Gewicht",
    };
    return `${who} möchte außerdem sehen: ${joined(kinds.map((kind) => names[kind]), "und")}. Öffne die Gruppe, um es zu erlauben.`;
  },
  yourCoach: "Dein Coach",
};

const fr: PushCopy = {
  commented: (who, count) =>
    count < 2 ? `${who} a commenté ta journée.` : `${who} a laissé ${n("fr")(count)} commentaires sur ta journée.`,
  fatSecret: {
    done: "Import FatSecret terminé",
    failed: "L’import FatSecret s’est arrêté avant la fin. Ouvre « Connexions » pour réessayer.",
    failedTitle: "Import FatSecret interrompu",
    report: ({ days, entries, weights }) => {
      // French says the singular below 2.
      const p = (count: number, one: string, other: string) => `${n("fr")(count)} ${pluralForm("fr", count, { one, other })}`;
      if (entries === 0 && weights === 0) return "Rien de nouveau à importer depuis FatSecret.";
      const parts = [];
      if (entries > 0) parts.push(`${p(entries, "aliment", "aliments")} sur ${p(days, "jour", "jours")}`);
      if (weights > 0) parts.push(p(weights, "pesée", "pesées"));
      return `Importé : ${parts.join(" et ")}.`;
    },
  },
  moreComments: (count) => ` (+${count} autres)`,
  reviewed: (who, reacted) => `${who} a vérifié ta journée${reacted ? " et y a réagi" : ""}.`,
  shareAsk: (who, kinds) => {
    const names: Record<GroupShareKind, string> = {
      activity: "ton activité",
      meals: "le détail de tes repas",
      photos: "les photos de tes repas",
      summary: "ton bilan du jour",
      weight: "ton poids",
    };
    return `${who} aimerait aussi voir ${joined(kinds.map((kind) => names[kind]), "et")}. Ouvre le groupe pour l’autoriser.`;
  },
  yourCoach: "Ton coach",
};

const it: PushCopy = {
  commented: (who, count) =>
    count === 1 ? `${who} ha commentato la tua giornata.` : `${who} ha lasciato ${n("it")(count)} commenti sulla tua giornata.`,
  fatSecret: {
    done: "Importazione da FatSecret completata",
    failed: "L’importazione da FatSecret si è interrotta prima della fine. Apri “Connessioni” per riprovare.",
    failedTitle: "Importazione da FatSecret interrotta",
    report: ({ days, entries, weights }) => {
      // Italian says the singular for exactly 1 only.
      const p = (count: number, one: string, other: string) => `${n("it")(count)} ${pluralForm("it", count, { one, other })}`;
      if (entries === 0 && weights === 0) return "Niente di nuovo da importare da FatSecret.";
      const parts = [];
      if (entries > 0) parts.push(`${p(entries, "alimento", "alimenti")} in ${p(days, "giorno", "giorni")}`);
      if (weights > 0) parts.push(p(weights, "pesata", "pesate"));
      return `Abbiamo importato ${parts.join(" e ")}.`;
    },
  },
  moreComments: (count) => ` (+${count} ${count === 1 ? "altro" : "altri"})`,
  reviewed: (who, reacted) => `${who} ha rivisto la tua giornata${reacted ? " e ha reagito" : ""}.`,
  shareAsk: (who, kinds) => {
    const names: Record<GroupShareKind, string> = {
      activity: "attività",
      meals: "alimenti dei pasti",
      photos: "foto dei pasti",
      summary: "riepilogo del giorno",
      weight: "peso",
    };
    return `${who} vorrebbe vedere anche: ${joined(kinds.map((kind) => names[kind]), "e")}. Apri il gruppo per consentirlo.`;
  },
  yourCoach: "Il tuo coach",
};

const pt: PushCopy = {
  commented: (who, count) =>
    count < 2 ? `${who} comentou seu dia.` : `${who} deixou ${n("pt")(count)} comentários no seu dia.`,
  fatSecret: {
    done: "Importação do FatSecret concluída",
    failed: "A importação do FatSecret parou antes de terminar. Abra “Login e contas vinculadas” na aba “Eu” para tentar de novo.",
    failedTitle: "Importação do FatSecret interrompida",
    report: ({ days, entries, weights }) => {
      // Portuguese says the singular below 2, like French.
      const p = (count: number, one: string, other: string) => `${n("pt")(count)} ${pluralForm("pt", count, { one, other })}`;
      if (entries === 0 && weights === 0) return "Nada de novo para trazer do FatSecret.";
      const parts = [];
      if (entries > 0) parts.push(`${p(entries, "alimento", "alimentos")} em ${p(days, "dia", "dias")}`);
      if (weights > 0) parts.push(p(weights, "pesagem", "pesagens"));
      return `Importamos ${parts.join(" e ")}.`;
    },
  },
  moreComments: (count) => ` (+${count} ${pluralForm("pt", count, { one: "outro", other: "outros" })})`,
  reviewed: (who, reacted) => `${who} revisou seu dia${reacted ? " e reagiu" : ""}.`,
  shareAsk: (who, kinds) => {
    const names: Record<GroupShareKind, string> = {
      activity: "atividade",
      meals: "alimentos das refeições",
      photos: "fotos das refeições",
      summary: "resumo do dia",
      weight: "peso",
    };
    return `${who} também quer ver: ${joined(kinds.map((kind) => names[kind]), "e")}. Abra o grupo para permitir.`;
  },
  yourCoach: "Seu coach",
};

const COPY: Record<Locale, PushCopy> = { de, en, es, fr, it, pt, ru };

export function pushCopy(locale: Locale): PushCopy {
  return COPY[locale];
}

// The language a person reads the server's words in when there's no request to ask: the one saved on
// their account, else English.
export async function userLocale(userId: string): Promise<Locale> {
  const profile = await prisma.userProfile.findUnique({ select: { locale: true }, where: { userId } });
  return profile?.locale && isLocale(profile.locale) ? profile.locale : "en";
}
