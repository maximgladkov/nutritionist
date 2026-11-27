import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Netherlands Dutch, informal "je", like the app. No space before ":", "!" and "?"; quotes are “ ”.
// "Left" lines start with "Nog", so they read the same for 1 and for 20.
const number = (value: number) => formatNumber("nl", value);

// Dutch says the singular only for exactly 1: "0 dagen", "1 dag", "2 dagen".
function p(count: number, one: string, other: string): string {
  return `${number(count)} ${pluralForm("nl", count, { one, other })}`;
}

const UNITS: Record<Unit, [one: string, other: string]> = {
  calls: ["gesprek", "gesprekken"],
  days: ["dag", "dagen"],
  foods: ["voedingsmiddel", "voedingsmiddelen"],
  ideas: ["idee", "ideeën"],
  kcal: ["kcal", "kcal"],
  kg: ["kg", "kg"],
  messages: ["bericht", "berichten"],
  minutes: ["minuut", "minuten"],
  steps: ["stap", "stappen"],
  "weigh-ins": ["weging", "wegingen"],
};

const days = (count: number) => p(count, "dag", "dagen");
// "1 dag op rij", "7 dagen op rij", as the app says it.
const inARow = (count: number) => `${days(count)} op rij`;

export const nl: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "nl",
  notStarted: "Nog niet begonnen",
  number,
  toGo: (count, unit) => `Nog ${unit ? p(count, ...UNITS[unit]) : number(count)}.`,
  unlocked: "Ontgrendeld",

  streak: {
    daysToGo: (count) => `Nog ${days(count)}`,
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Voeg vandaag een maaltijd toe om een reeks te beginnen.";
      const standing = current === best ? "Je beste reeks tot nu toe." : `Je beste reeks: ${days(best)}.`;
      return loggedToday ? `${standing} Je hebt vandaag al iets toegevoegd.` : `${standing} Voeg vandaag een maaltijd toe om hem vast te houden.`;
    },
    next: (title) => `Volgende badge: ${title}`,
  },
  streaks: {
    badgeTitle: inARow,
    context: "Dagen op rij",
    rule: "Voeg elke dag minstens één maaltijd toe.",
    tiers: {
      3: { description: "Drie dagen op rij minstens één maaltijd toegevoegd.", name: "3 dagen" },
      7: { description: "Een hele week bijgehouden. Zo begint een gewoonte.", name: "7 dagen" },
      14: { description: "Twee weken bijgehouden zonder een dag over te slaan.", name: "14 dagen" },
      30: { description: "Een hele maand bijgehouden. Het is nu een gewoonte.", name: "30 dagen" },
      100: { description: "Honderd dagen op rij. Weinig mensen komen zo ver.", name: "100 dagen" },
      365: { description: "Een heel jaar bijgehouden, elke dag weer.", name: "1 jaar" },
    },
    title: "Reeksen",
    toGo: (count) => `Nog ${inARow(count)} met een maaltijd.`,
  },
  tiers: { 7: "7 dagen", 30: "1 maand", 365: "1 jaar" },
  protein: {
    context: "Eiwitdoel",
    describe: (count) => `Je spieren hebben het gemerkt. ${days(count)} om trots op te zijn.`,
    rule: (grams) => (grams ? `Eet op een dag minstens ${grams} gram eiwit.` : "Stel een eiwitdoel in en haal het op een dag."),
    title: "Eiwitdoel",
    toGo: (count, grams) => (grams ? `Nog ${days(count)} met ${grams} gram eiwit.` : "Stel een eiwitdoel in om te beginnen."),
  },
  calories: {
    badgeTitle: "Binnen je doel",
    context: "Calorieën binnen je doel",
    describe: (count) => `${days(count)} lang binnen 10% van je doel. Dat is balans.`,
    rule: (kcal) =>
      kcal ? `Blijf op een dag binnen 10% van ${number(kcal)} kcal.` : "Stel een caloriedoel in en blijf op een dag binnen 10% daarvan.",
    title: "Calorieën binnen je doel",
    toGo: (count, kcal) => (kcal ? `Nog ${days(count)} binnen 10% van je caloriedoel.` : "Stel een caloriedoel in om te beginnen."),
  },
  weight: {
    context: "Gewicht",
    goalDescription: (kg) => `Je hebt je doel van ${kg} kg gehaald.`,
    goalName: "Doel",
    goalTitle: (kg) => `Streefgewicht · ${kg} kg`,
    rule: (from, to) => (from && to ? `Mijlpalen op weg van ${from} naar ${to} kg.` : "Mijlpalen op weg naar je streefgewicht."),
    steps: {
      "gain-1": { description: "Je eerste kilo erbij. Ga zo door.", title: "Eerste kilo erbij" },
      "gain-5": { description: "Vijf kilo zwaarder dan bij je start.", title: "Vijf kilo erbij" },
      "lose-1": { description: "Je eerste kilo eraf. Ga zo door.", title: "Eerste kilo eraf" },
      "lose-5": { description: "Vijf kilo lichter dan bij je start.", title: "Vijf kilo eraf" },
    },
    title: "Gewicht",
    toGo: (kg) => `Nog ${kg} kg.`,
  },
  firsts: {
    context: "Eerste keer",
    foods: {
      description: "Je dagboek kent je inmiddels goed.",
      name: "100 voedingsmiddelen",
      title: "100 voedingsmiddelen toegevoegd",
      toGo: (count) => `Nog ${p(count, "voedingsmiddel", "voedingsmiddelen")} toe te voegen.`,
    },
    once: {
      "first-barcode": { description: "Richten, piep, toegevoegd. Zo simpel is het.", name: "Barcode", title: "Eerste barcode gescand", toGo: "Scan de barcode van een product." },
      "first-group": { description: "Samen gaat het makkelijker.", name: "Groep", title: "Eerste groep", toGo: "Neem deel aan een groep met een code of een link." },
      "first-photo": { description: "Je dagboek ziet er nu al lekkerder uit.", name: "Foto", title: "Eerste maaltijdfoto", toGo: "Voeg een foto toe aan een maaltijd." },
      "first-voice": { description: "Typen is niet nodig.", name: "Stem", title: "Met je stem beschreven", toGo: "Zeg wat je hebt gegeten in plaats van het te typen." },
    },
    rule: "Probeer elke manier om bij te houden en contact te maken.",
    title: "Eerste keren",
    weighIns: {
      description: "De trend zegt meer dan één los getal.",
      name: "Wegingen",
      title: "10 wegingen",
      toGo: (count) => `Nog ${p(count, "weging", "wegingen")} toe te voegen.`,
    },
  },
  steps: {
    context: "Stappen",
    inADay: (amount) => `${amount} op een dag`,
    inOneDay: (amount) => `Zet ${amount} op één dag.`,
    oftenEarned: ["Zeven dagen boven de 10.000. Het wordt een gewoonte.", "Dertig dagen boven de 10.000. Sterke benen."],
    oftenTitle: "10.000 stappen",
    oftenToGo: (count, amount) => `Nog ${days(count)} met ${amount} of meer.`,
    rule: "De stappen die je op een dag zet, uit Apple Health.",
    targets: {
      5_000: "Een flinke wandeling. Mooi begin.",
      10_000: "De klassieker, en het is je gelukt.",
      15_000: "Voor de meeste mensen is dat zo’n elf kilometer.",
      20_000: "Voeten omhoog. Dat heb je verdiend.",
    },
    title: "Stappen",
  },
  burned: {
    context: "Verbrande calorieën",
    inADay: (amount) => `${amount} verbrand op een dag`,
    inOneDay: (amount) => `Verbrand op één dag ${amount} door te bewegen.`,
    oftenEarned: ["Zeven actieve dagen. Je lichaam merkt het.", "Dertig actieve dagen. Indrukwekkend."],
    oftenTitle: "500 kcal verbrand",
    oftenToGo: (count, amount) => `Nog ${days(count)} waarop je ${amount} of meer verbrandt.`,
    rule: "De calorieën die je op een dag verbrandt door te bewegen, uit Apple Health.",
    targets: {
      300: "Zoveel als een stevige training.",
      500: "Je hebt flink bewogen. Dat zie je.",
      750: "Een drukke dag. Drink wat water.",
      1_000: "Een enorme dag. Rust goed uit en eet goed.",
    },
    title: "Verbrande calorieën",
  },
  assistant: {
    badges: {
      call: { description: "Goed gesprek. Je coach onthoudt wat je zei.", name: "Gesprek", title: "Eerste gesprek", toGo: () => "Voer een spraakgesprek met je coach." },
      "calls-5": { description: "Sommige dingen kun je beter hardop zeggen.", name: "5 gesprekken", title: "5 gesprekken", toGo: (count) => `Nog ${p(count, "gesprek", "gesprekken")}.` },
      chat: { description: "Vraag wat je wilt, wanneer je wilt. Je coach kent je dagboek.", name: "Hoi", title: "Eerste bericht", toGo: () => "Stuur je coach een bericht." },
      "chats-50": { description: "Jullie kennen elkaar inmiddels goed.", name: "50 berichten", title: "50 berichten", toGo: (count) => `Nog ${p(count, "bericht", "berichten")}.` },
      idea: { description: "Je coach stelde het voor, jij at het op.", name: "Idee", title: "Goed idee", toGo: () => "Voeg een maaltijd toe die je coach voorstelt." },
      "ideas-10": { description: "Jullie hebben duidelijk dezelfde smaak.", name: "10 ideeën", title: "10 ideeën opgegeten", toGo: (count) => `Nog ${p(count, "idee", "ideeën")} toe te voegen.` },
      photo: { description: "Een foto zegt meer dan duizend woorden. Ook van een menukaart.", name: "Foto", title: "Laten zien en vragen", toGo: () => "Stuur je coach een foto, bijvoorbeeld van een menukaart." },
      recipe: { description: "Het staat klaar in “Eten toevoegen” als je gaat koken.", name: "Recept", title: "Eerste recept", toGo: () => "Vraag je coach om een recept en sla het op." },
      reply: { description: "Eén tik in “Vandaag” en jullie zijn in gesprek.", name: "Antwoord", title: "Gesprek opgepakt", toGo: () => "Tik in “Vandaag” op het bericht van je coach." },
      voice: { description: "Makkelijker dan typen als je je handen vol hebt.", name: "Spraakbericht", title: "Eerste spraakbericht", toGo: () => "Stuur je coach een spraakbericht." },
    },
    context: "Assistent",
    minutes: (minutes) => {
      // "uur" has no plural after a number: "1 uur", "2 uur".
      const span = minutes < 60 ? `${minutes} min` : p(minutes / 60, "uur", "uur");
      return {
        description: minutes < 60 ? "Een goed begin, voor jou en je coach." : minutes < 300 ? "Goed bestede tijd." : "Bijna oude vrienden.",
        name: span,
        title: `${minutes < 60 ? p(minutes, "minuut", "minuten") : span} gepraat`,
        toGo: (count) => `Nog ${p(Math.ceil(count), "minuut", "minuten")} met je coach.`,
      };
    },
    rule: "Leer je coach kennen: schrijf, praat, laat zien en kook.",
    title: "Assistent",
  },
};
