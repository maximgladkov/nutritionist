import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

const number = (value: number) => formatNumber("de", value);

function p(count: number, one: string, other: string): string {
  return `${number(count)} ${pluralForm("de", count, { one, other })}`;
}

const UNITS: Record<Unit, [one: string, other: string]> = {
  calls: ["Gespräch", "Gespräche"],
  days: ["Tag", "Tage"],
  foods: ["Lebensmittel", "Lebensmittel"],
  ideas: ["Idee", "Ideen"],
  kcal: ["kcal", "kcal"],
  kg: ["kg", "kg"],
  messages: ["Nachricht", "Nachrichten"],
  minutes: ["Minute", "Minuten"],
  steps: ["Schritte", "Schritte"],
  "weigh-ins": ["Wiegung", "Wiegungen"],
};

const days = (count: number) => p(count, "Tag", "Tage");
// "Noch 1 Tag", "Noch 3 Tage".
const left = (amount: string) => `Noch ${amount}`;

export const de: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "de",
  notStarted: "Noch nicht begonnen",
  number,
  toGo: (count, unit) => `${left(unit ? p(count, ...UNITS[unit]) : number(count))}.`,
  unlocked: "Freigeschaltet",

  streak: {
    daysToGo: (count) => left(days(count)),
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Trag heute eine Mahlzeit ein, um eine Serie zu starten.";
      const standing = current === best ? "Deine bisher beste Serie." : `Deine beste Serie: ${days(best)}.`;
      return loggedToday ? `${standing} Heute hast du schon eingetragen.` : `${standing} Trag heute eine Mahlzeit ein, damit sie hält.`;
    },
    next: (title) => `Als Nächstes: ${title}`,
  },
  streaks: {
    badgeTitle: (count) => `${count} ${count === 1 ? "Tag" : "Tage"} in Folge`,
    context: "Tage in Folge",
    rule: "Trag jeden Tag mindestens eine Mahlzeit ein.",
    tiers: {
      3: { description: "Drei Tage in Folge mit mindestens einer eingetragenen Mahlzeit.", name: "3 Tage" },
      7: { description: "Eine ganze Woche eingetragen. So fangen Gewohnheiten an.", name: "7 Tage" },
      14: { description: "Zwei Wochen ohne Lücke eingetragen.", name: "14 Tage" },
      30: { description: "Einen ganzen Monat eingetragen. Das ist jetzt eine Gewohnheit.", name: "30 Tage" },
      100: { description: "Hundert Tage in Folge. Das schaffen nur wenige.", name: "100 Tage" },
      365: { description: "Ein Jahr lang eingetragen, an jedem einzelnen Tag.", name: "1 Jahr" },
    },
    title: "Serien",
    toGo: (count) => `Noch ${days(count)} in Folge mit einer eingetragenen Mahlzeit.`,
  },
  tiers: { 7: "7 Tage", 30: "1 Monat", 365: "1 Jahr" },
  protein: {
    context: "Eiweißziel",
    describe: (count) => `Deine Muskeln haben es gemerkt. ${days(count)}, auf die du stolz sein kannst.`,
    rule: (grams) =>
      grams ? `Iss an einem Tag mindestens ${grams} Gramm Eiweiß.` : "Setz dir ein Eiweißziel und erreich es an einem Tag.",
    title: "Eiweißziel",
    toGo: (count, grams) =>
      grams ? `Noch ${days(count)} mit ${grams} Gramm Eiweiß.` : "Setz dir ein Eiweißziel, um hiermit anzufangen.",
  },
  calories: {
    badgeTitle: "Im Ziel",
    context: "Kalorien im Ziel",
    describe: (count) => `${days(count)} lang höchstens 10 % neben deinem Ziel. Das ist Balance.`,
    rule: (kcal) =>
      kcal
        ? `Bleib am Tag höchstens 10 % neben ${number(kcal)} kcal.`
        : "Setz dir ein Kalorienziel und bleib am Tag höchstens 10 % daneben.",
    title: "Kalorien im Ziel",
    toGo: (count, kcal) =>
      kcal ? `Noch ${days(count)} höchstens 10 % neben deinem Kalorienziel.` : "Setz dir ein Kalorienziel, um hiermit anzufangen.",
  },
  weight: {
    context: "Gewicht",
    goalDescription: (kg) => `Du hast dein Ziel von ${kg} kg erreicht.`,
    goalName: "Ziel",
    goalTitle: (kg) => `Zielgewicht · ${kg} kg`,
    rule: (from, to) => (from && to ? `Etappen auf dem Weg von ${from} zu ${to} kg.` : "Etappen auf dem Weg zu deinem Zielgewicht."),
    steps: {
      "gain-1": { description: "Dein erstes Kilo mehr. Weiter so.", title: "Erstes Kilo mehr" },
      "gain-5": { description: "Fünf Kilo mehr als zu Beginn.", title: "Fünf Kilo mehr" },
      "lose-1": { description: "Dein erstes Kilo weniger. Weiter so.", title: "Erstes Kilo weniger" },
      "lose-5": { description: "Fünf Kilo leichter als zu Beginn.", title: "Fünf Kilo weniger" },
    },
    title: "Gewicht",
    toGo: (kg) => `Noch ${kg} kg.`,
  },
  firsts: {
    context: "Zum ersten Mal",
    foods: {
      description: "Dein Tagebuch kennt dich inzwischen.",
      name: "100 Lebensmittel",
      title: "100 Lebensmittel eingetragen",
      toGo: (count) => `Noch ${p(count, "Lebensmittel", "Lebensmittel")} eintragen.`,
    },
    once: {
      "first-barcode": { description: "Draufhalten, piep, eingetragen. Mehr braucht es nicht.", name: "Barcode", title: "Erster Barcode-Scan", toGo: "Scanne den Barcode eines Produkts." },
      "first-group": { description: "Zusammen geht’s leichter.", name: "Gruppe", title: "Einer Gruppe beigetreten", toGo: "Tritt einer Gruppe mit Code oder Link bei." },
      "first-photo": { description: "Dein Tagebuch sieht schon appetitlicher aus.", name: "Foto", title: "Erstes Mahlzeitenfoto", toGo: "Füge einer Mahlzeit ein Foto hinzu." },
      "first-voice": { description: "Ganz ohne Tippen.", name: "Stimme", title: "Per Stimme beschrieben", toGo: "Sag, was du gegessen hast, statt es zu tippen." },
    },
    rule: "Probier alle Wege aus, einzutragen und dich zu verbinden.",
    title: "Erste Male",
    weighIns: {
      description: "Der Trend zählt mehr als jede einzelne Zahl.",
      name: "Wiegungen",
      title: "10 Wiegungen",
      toGo: (count) => `Noch ${p(count, "Wiegung", "Wiegungen")} eintragen.`,
    },
  },
  steps: {
    context: "Schritte",
    inADay: (amount) => `${amount} an einem Tag`,
    inOneDay: (amount) => `Geh ${amount} an einem einzigen Tag.`,
    oftenEarned: ["Sieben Tage über 10.000. Das wird zur Gewohnheit.", "Dreißig Tage über 10.000. Starke Beine."],
    oftenTitle: "10.000 Schritte",
    oftenToGo: (count, amount) => `Noch ${days(count)} mit ${amount} oder mehr.`,
    rule: "Schritte, die du an einem Tag gehst, aus Apple Health.",
    targets: {
      5_000: "Ein ordentlicher Spaziergang. Ein super Anfang.",
      10_000: "Der Klassiker – und du hast es geschafft.",
      15_000: "Für die meisten sind das rund elf Kilometer.",
      20_000: "Füße hoch. Das hast du dir verdient.",
    },
    title: "Schritte",
  },
  burned: {
    context: "Verbrannte Kalorien",
    inADay: (amount) => `${amount} an einem Tag verbrannt`,
    inOneDay: (amount) => `Verbrenn an einem einzigen Tag ${amount} durch Bewegung.`,
    oftenEarned: ["Sieben aktive Tage. Dein Körper merkt das.", "Dreißig aktive Tage. Beeindruckend."],
    oftenTitle: "500 kcal verbrannt",
    oftenToGo: (count, amount) => `Noch ${days(count)} mit ${amount} oder mehr verbrannt.`,
    rule: "Kalorien, die du an einem Tag durch Bewegung verbrennst, aus Apple Health.",
    targets: {
      300: "So viel wie ein gutes, solides Training.",
      500: "Du hast dich richtig bewegt. Das sieht man.",
      750: "Ein großer Tag. Trink etwas Wasser.",
      1_000: "Ein riesiger Tag. Erhol dich gut und iss ordentlich.",
    },
    title: "Verbrannte Kalorien",
  },
  assistant: {
    badges: {
      call: { description: "Gutes Gespräch. Er merkt sich, was du gesagt hast.", name: "Gespräch", title: "Erstes Gespräch", toGo: () => "Sprich live mit deinem Coach." },
      "calls-5": { description: "Manches sagt man besser laut.", name: "5 Gespräche", title: "5 Gespräche", toGo: (count) => `${left(p(count, "Gespräch", "Gespräche"))}.` },
      chat: { description: "Frag, was du willst, wann du willst. Er kennt dein Tagebuch.", name: "Hallo", title: "Erste Nachricht", toGo: () => "Schreib deinem Coach." },
      "chats-50": { description: "Inzwischen kennt ihr euch gut.", name: "50 Nachrichten", title: "50 Nachrichten", toGo: (count) => `${left(p(count, "Nachricht", "Nachrichten"))}.` },
      idea: { description: "Dein Coach hat’s vorgeschlagen, du hast’s gegessen.", name: "Idee", title: "Gute Idee", toGo: () => "Füge eine Mahlzeit hinzu, die dein Coach vorschlägt." },
      "ideas-10": { description: "Ihr habt eindeutig denselben Geschmack.", name: "10 Ideen", title: "10 Ideen gegessen", toGo: (count) => `Noch ${p(count, "Idee", "Ideen")} hinzufügen.` },
      photo: { description: "Ein Bild sagt mehr als tausend Worte. Speisekarten gehen auch.", name: "Foto", title: "Zeigen und fragen", toGo: () => "Schick deinem Coach ein Foto, zum Beispiel eine Speisekarte." },
      recipe: { description: "Es wartet unter „Essen eintragen“, wann immer du kochst.", name: "Rezept", title: "Erstes Rezept", toGo: () => "Frag deinen Coach nach einem Rezept und speichere es." },
      reply: { description: "Einmal auf „Heute“ tippen, und ihr redet.", name: "Antwort", title: "Den Faden aufgenommen", toGo: () => "Tippe auf „Heute“ auf die Nachricht deines Coachs." },
      voice: { description: "Leichter als Tippen, wenn die Hände voll sind.", name: "Sprachnachricht", title: "Erste Sprachnachricht", toGo: () => "Schick deinem Coach eine Sprachnachricht." },
    },
    context: "Assistent",
    minutes: (minutes) => {
      const span = minutes < 60 ? `${minutes} min` : p(minutes / 60, "Stunde", "Stunden");
      return {
        description: minutes < 60 ? "Ein guter Start für dich und deinen Coach." : minutes < 300 ? "Gut investierte Zeit." : "Fast schon alte Freunde.",
        name: span,
        title: `${minutes < 60 ? p(minutes, "Minute", "Minuten") : span} zusammen`,
        toGo: (count) => `Noch ${p(Math.ceil(count), "Minute", "Minuten")} mit deinem Coach.`,
      };
    },
    rule: "Lern deinen Coach kennen: schreiben, sprechen, zeigen und kochen.",
    title: "Assistent",
  },
};
