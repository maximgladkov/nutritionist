import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Poland Polish, informal "ty", like the app. No space before ":", "!" and "?"; quotes are „ ”.
// We don't know anyone's gender, so no past tense about the user: present tense, "-no" forms or labels.
// "Left" lines start with "Jeszcze", so no verb has to agree with the number.
const number = (value: number) => formatNumber("pl", value);

// "1 dzień", "2 dni", "5 dni", "21 dni"; fractions take the genitive singular ("1,5 dnia").
function p(count: number, one: string, few: string, many: string, other: string): string {
  return `${number(count)} ${pluralForm("pl", count, { few, many, one, other })}`;
}

const UNITS: Record<Unit, [one: string, few: string, many: string, other: string]> = {
  calls: ["rozmowa", "rozmowy", "rozmów", "rozmowy"],
  days: ["dzień", "dni", "dni", "dnia"],
  foods: ["produkt", "produkty", "produktów", "produktu"],
  ideas: ["pomysł", "pomysły", "pomysłów", "pomysłu"],
  kcal: ["kcal", "kcal", "kcal", "kcal"],
  kg: ["kg", "kg", "kg", "kg"],
  messages: ["wiadomość", "wiadomości", "wiadomości", "wiadomości"],
  minutes: ["minuta", "minuty", "minut", "minuty"],
  steps: ["krok", "kroki", "kroków", "kroku"],
  "weigh-ins": ["ważenie", "ważenia", "ważeń", "ważenia"],
};

const days = (count: number) => p(count, ...UNITS.days);
// "1 dzień z rzędu", "7 dni z rzędu", as the app says it.
const inARow = (count: number) => `${days(count)} z rzędu`;

export const pl: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "pl",
  notStarted: "Jeszcze nie rozpoczęto",
  number,
  toGo: (count, unit) => `Jeszcze ${unit ? p(count, ...UNITS[unit]) : number(count)}.`,
  unlocked: "Odblokowano",

  streak: {
    daysToGo: (count) => `Jeszcze ${days(count)}`,
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Dodaj dziś posiłek, aby zacząć serię.";
      const standing = current === best ? "To twoja najlepsza seria." : `Twoja najlepsza seria: ${days(best)}.`;
      return loggedToday ? `${standing} Dziś już coś zapisano.` : `${standing} Dodaj dziś posiłek, aby jej nie przerwać.`;
    },
    next: (title) => `Następna odznaka: ${title}`,
  },
  streaks: {
    badgeTitle: inARow,
    context: "Dni z rzędu",
    rule: "Dodawaj co najmniej jeden posiłek każdego dnia.",
    tiers: {
      3: { description: "Trzy dni z rzędu z co najmniej jednym zapisanym posiłkiem.", name: "3 dni" },
      7: { description: "Cały tydzień zapisywania. Tak zaczynają się nawyki.", name: "7 dni" },
      14: { description: "Dwa tygodnie zapisywania bez przerwy.", name: "14 dni" },
      30: { description: "Cały miesiąc zapisywania. To już nawyk.", name: "30 dni" },
      100: { description: "Sto dni z rzędu. Niewielu tu dociera.", name: "100 dni" },
      365: { description: "Rok zapisywania, dzień w dzień.", name: "1 rok" },
    },
    title: "Serie",
    toGo: (count) => `Jeszcze ${inARow(count)} z zapisanym posiłkiem.`,
  },
  tiers: { 7: "7 dni", 30: "1 miesiąc", 365: "1 rok" },
  protein: {
    context: "Cel białkowy",
    describe: (count) => `Twoje mięśnie to czują. ${days(count)} z celem białkowym.`,
    rule: (grams) => (grams ? `Zjedz w ciągu dnia co najmniej ${grams} g białka.` : "Ustaw cel białkowy i osiągnij go w ciągu dnia."),
    title: "Cel białkowy",
    toGo: (count, grams) => (grams ? `Jeszcze ${days(count)} z co najmniej ${grams} g białka.` : "Ustaw cel białkowy, aby zacząć."),
  },
  calories: {
    badgeTitle: "W normie",
    context: "Kalorie w normie",
    describe: (count) => `${days(count)} w granicach 10% celu. To się nazywa równowaga.`,
    rule: (kcal) =>
      kcal
        ? `Trzymaj się w ciągu dnia w granicach 10% od ${number(kcal)} kcal.`
        : "Ustaw cel kaloryczny i trzymaj się w ciągu dnia w granicach 10% od niego.",
    title: "Kalorie w normie",
    toGo: (count, kcal) => (kcal ? `Jeszcze ${days(count)} w granicach 10% celu kalorycznego.` : "Ustaw cel kaloryczny, aby zacząć."),
  },
  weight: {
    context: "Waga",
    goalDescription: (kg) => `Cel osiągnięty: ${kg} kg.`,
    goalName: "Cel",
    goalTitle: (kg) => `Waga docelowa · ${kg} kg`,
    rule: (from, to) => (from && to ? `Kamienie milowe na drodze od ${from} do ${to} kg.` : "Kamienie milowe na drodze do wagi docelowej."),
    steps: {
      "gain-1": { description: "Pierwszy kilogram więcej. Tak trzymaj.", title: "Pierwszy kilogram w górę" },
      "gain-5": { description: "Pięć kilogramów więcej niż na starcie.", title: "Plus pięć kilogramów" },
      "lose-1": { description: "Pierwszy kilogram mniej. Tak trzymaj.", title: "Pierwszy kilogram w dół" },
      "lose-5": { description: "Pięć kilogramów mniej niż na starcie.", title: "Minus pięć kilogramów" },
    },
    title: "Waga",
    toGo: (kg) => `Jeszcze ${kg} kg.`,
  },
  firsts: {
    context: "Pierwszy raz",
    foods: {
      description: "Twój dziennik już dobrze cię zna.",
      name: "100 produktów",
      title: "100 zapisanych produktów",
      toGo: (count) => `Jeszcze ${p(count, ...UNITS.foods)} do zapisania.`,
    },
    once: {
      "first-barcode": { description: "Celujesz, pik, zapisane. Tylko tyle.", name: "Kod kreskowy", title: "Pierwszy kod kreskowy", toGo: "Zeskanuj kod kreskowy produktu." },
      "first-group": { description: "Razem jest łatwiej.", name: "Grupa", title: "Pierwsza grupa", toGo: "Dołącz do grupy kodem lub linkiem." },
      "first-photo": { description: "Twój dziennik już wygląda smaczniej.", name: "Zdjęcie", title: "Pierwsze zdjęcie posiłku", toGo: "Dodaj zdjęcie do posiłku." },
      "first-voice": { description: "Bez pisania.", name: "Głos", title: "Opisane głosem", toGo: "Powiedz, co jesz, zamiast to pisać." },
    },
    rule: "Wypróbuj wszystkie sposoby zapisywania i kontaktu.",
    title: "Pierwsze razy",
    weighIns: {
      description: "Trend mówi więcej niż pojedyncza liczba.",
      name: "Ważenia",
      title: "10 ważeń",
      toGo: (count) => `Jeszcze ${p(count, ...UNITS["weigh-ins"])} do zapisania.`,
    },
  },
  steps: {
    context: "Kroki",
    inADay: (amount) => `${amount} w jeden dzień`,
    inOneDay: (amount) => `Zrób ${amount} w ciągu jednego dnia.`,
    oftenEarned: ["Siedem dni powyżej 10 000. To staje się nawykiem.", "Trzydzieści dni powyżej 10 000. Mocne nogi."],
    oftenTitle: "10 000 kroków",
    oftenToGo: (count, amount) => `Jeszcze ${days(count)} z wynikiem ${amount} lub więcej.`,
    rule: "Kroki, które robisz w ciągu dnia, z Apple Health.",
    targets: {
      5_000: "Porządny spacer. Dobry początek.",
      10_000: "Klasyka – i udało się.",
      15_000: "Dla większości to około jedenastu kilometrów.",
      20_000: "Nogi w górę. Należy ci się.",
    },
    title: "Kroki",
  },
  burned: {
    context: "Spalone kalorie",
    // "Spalono" is impersonal, so it reads right for any number.
    inADay: (amount) => `Spalono ${amount} w jeden dzień`,
    inOneDay: (amount) => `Spal ${amount} w ciągu jednego dnia dzięki ruchowi.`,
    oftenEarned: ["Siedem aktywnych dni. Twoje ciało to czuje.", "Trzydzieści aktywnych dni. Robi wrażenie."],
    oftenTitle: "Spalono 500 kcal",
    oftenToGo: (count, amount) => `Jeszcze ${days(count)} z wynikiem ${amount} lub więcej.`,
    rule: "Kalorie, które spalasz ruchem w ciągu dnia, z Apple Health.",
    targets: {
      300: "Tyle, co porządny trening.",
      500: "Sporo ruchu. Widać to.",
      750: "Wielki dzień. Napij się wody.",
      1_000: "Ogromny dzień. Dobrze odpocznij i porządnie zjedz.",
    },
    title: "Spalone kalorie",
  },
  assistant: {
    badges: {
      call: { description: "Dobra rozmowa. Trener pamięta, co mówisz.", name: "Rozmowa", title: "Pierwsza rozmowa", toGo: () => "Porozmawiaj z trenerem na żywo." },
      "calls-5": { description: "Niektóre rzeczy lepiej powiedzieć na głos.", name: "5 rozmów", title: "5 rozmów", toGo: (count) => `Jeszcze ${p(count, ...UNITS.calls)}.` },
      chat: { description: "Pytaj, o co chcesz i kiedy chcesz. Trener zna twój dziennik.", name: "Cześć", title: "Pierwsza wiadomość", toGo: () => "Napisz do swojego trenera." },
      "chats-50": { description: "Już dobrze się znacie.", name: "50 wiadomości", title: "50 wiadomości", toGo: (count) => `Jeszcze ${p(count, ...UNITS.messages)}.` },
      idea: { description: "Pomysł trenera, twój talerz.", name: "Pomysł", title: "Dobry pomysł", toGo: () => "Dodaj posiłek zaproponowany przez trenera." },
      "ideas-10": { description: "Najwyraźniej macie podobny gust.", name: "10 pomysłów", title: "10 zjedzonych pomysłów", toGo: (count) => `Jeszcze ${p(count, ...UNITS.ideas)} do dodania.` },
      photo: { description: "Jedno zdjęcie mówi więcej niż tysiąc słów. Zdjęcie menu też.", name: "Zdjęcie", title: "Pokaż i zapytaj", toGo: () => "Wyślij trenerowi zdjęcie, na przykład menu." },
      recipe: { description: "Czeka w „Dodaj jedzenie”, kiedy zabierasz się do gotowania.", name: "Przepis", title: "Pierwszy przepis", toGo: () => "Poproś trenera o przepis i zapisz go." },
      reply: { description: "Jedno stuknięcie w „Dziś” i już rozmawiacie.", name: "Odpowiedź", title: "Rozmowa podjęta", toGo: () => "Stuknij wiadomość trenera w „Dziś”." },
      voice: { description: "Łatwiej niż pisać, gdy masz zajęte ręce.", name: "Głosówka", title: "Pierwsza wiadomość głosowa", toGo: () => "Wyślij trenerowi wiadomość głosową." },
    },
    context: "Asystent",
    minutes: (minutes) => {
      // 90 minutes is "1,5 godziny" (the fraction form).
      const span = minutes < 60 ? `${minutes} min` : p(minutes / 60, "godzina", "godziny", "godzin", "godziny");
      return {
        description: minutes < 60 ? "Dobry początek dla ciebie i trenera." : minutes < 300 ? "Dobrze spędzony czas." : "Prawie starzy znajomi.",
        name: span,
        title: `Razem: ${minutes < 60 ? p(minutes, ...UNITS.minutes) : span}`,
        toGo: (count) => `Jeszcze ${p(Math.ceil(count), ...UNITS.minutes)} z trenerem.`,
      };
    },
    rule: "Poznaj trenera: pisz, rozmawiaj, pokazuj i gotuj.",
    title: "Asystent",
  },
};
