import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Informal "tu", like the app. Italian puts no space before ":", "!" and "?", and uses “ ”.
const number = (value: number) => formatNumber("it", value);

// Italian says the singular for exactly 1 only: "0 giorni", "1 giorno", "2 giorni".
function p(count: number, one: string, other: string): string {
  return `${number(count)} ${pluralForm("it", count, { one, other })}`;
}

const UNITS: Record<Unit, [one: string, other: string]> = {
  calls: ["chiamata", "chiamate"],
  days: ["giorno", "giorni"],
  foods: ["alimento", "alimenti"],
  ideas: ["idea", "idee"],
  kcal: ["kcal", "kcal"],
  kg: ["kg", "kg"],
  messages: ["messaggio", "messaggi"],
  minutes: ["minuto", "minuti"],
  steps: ["passo", "passi"],
  "weigh-ins": ["pesata", "pesate"],
};

const days = (count: number) => p(count, "giorno", "giorni");
// "Ancora 1 giorno", "Ancora 3 giorni".
const left = (amount: string) => `Ancora ${amount}`;

export const it: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "it",
  notStarted: "Non ancora iniziato",
  number,
  toGo: (count, unit) => `${left(unit ? p(count, ...UNITS[unit]) : number(count))}.`,
  unlocked: "Sbloccato",

  streak: {
    daysToGo: (count) => left(days(count)),
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Registra un pasto oggi per iniziare una serie.";
      const standing = current === best ? "La tua serie migliore finora." : `La tua serie migliore: ${days(best)}.`;
      return loggedToday ? `${standing} Oggi hai già registrato.` : `${standing} Registra un pasto oggi per non interromperla.`;
    },
    next: (title) => `Prossimo badge: ${title}`,
  },
  streaks: {
    badgeTitle: (count) => `${days(count)} di fila`,
    context: "Giorni di fila",
    rule: "Registra almeno un pasto ogni giorno.",
    tiers: {
      3: { description: "Tre giorni di fila con almeno un pasto registrato.", name: "3 giorni" },
      7: { description: "Una settimana intera registrata. È così che nascono le abitudini.", name: "7 giorni" },
      14: { description: "Due settimane registrate senza saltare un giorno.", name: "14 giorni" },
      30: { description: "Un mese intero registrato. Ormai è un’abitudine.", name: "30 giorni" },
      100: { description: "Cento giorni di fila. Ci arrivano in pochi.", name: "100 giorni" },
      365: { description: "Un anno intero registrato, ogni singolo giorno.", name: "1 anno" },
    },
    title: "Serie",
    toGo: (count) => `Ancora ${days(count)} di fila con un pasto registrato.`,
  },
  tiers: { 7: "7 giorni", 30: "1 mese", 365: "1 anno" },
  protein: {
    context: "Obiettivo proteine",
    describe: (count) => `I tuoi muscoli se ne sono accorti. ${days(count)} che contano.`,
    rule: (grams) =>
      grams ? `Mangia almeno ${grams} grammi di proteine in un giorno.` : "Imposta un obiettivo di proteine e raggiungilo in un giorno.",
    title: "Obiettivo proteine",
    toGo: (count, grams) =>
      grams ? `Ancora ${days(count)} con ${grams} grammi di proteine.` : "Imposta un obiettivo di proteine per iniziare.",
  },
  calories: {
    badgeTitle: "In linea",
    context: "Calorie in linea",
    describe: (count) => `Entro il 10% dal tuo obiettivo per ${days(count)}. Questo è equilibrio.`,
    rule: (kcal) =>
      kcal
        ? `Resta entro il 10% da ${number(kcal)} kcal nella giornata.`
        : "Imposta un obiettivo di calorie e resta entro il 10% nella giornata.",
    title: "Calorie in linea",
    toGo: (count, kcal) =>
      kcal ? `Ancora ${days(count)} entro il 10% dal tuo obiettivo di calorie.` : "Imposta un obiettivo di calorie per iniziare.",
  },
  weight: {
    context: "Peso",
    goalDescription: (kg) => `Hai raggiunto il tuo obiettivo di ${kg} kg.`,
    goalName: "Obiettivo",
    goalTitle: (kg) => `Peso obiettivo · ${kg} kg`,
    rule: (from, to) => (from && to ? `Le tappe del percorso da ${from} a ${to} kg.` : "Le tappe del percorso verso il tuo peso obiettivo."),
    steps: {
      "gain-1": { description: "Il tuo primo chilo in più. Continua così.", title: "Primo chilo in più" },
      "gain-5": { description: "Cinque chili in più rispetto all’inizio.", title: "Cinque chili in più" },
      "lose-1": { description: "Il tuo primo chilo in meno. Continua così.", title: "Primo chilo in meno" },
      "lose-5": { description: "Cinque chili in meno rispetto all’inizio.", title: "Cinque chili in meno" },
    },
    title: "Peso",
    toGo: (kg) => `Ancora ${kg} kg.`,
  },
  firsts: {
    context: "Prime volte",
    foods: {
      description: "Ormai il tuo diario ti conosce bene.",
      name: "100 alimenti",
      title: "100 alimenti registrati",
      toGo: (count) => `Ancora ${p(count, "alimento", "alimenti")} da registrare.`,
    },
    once: {
      "first-barcode": { description: "Inquadri, bip, registrato. Tutto qui.", name: "Codice a barre", title: "Primo codice a barre scansionato", toGo: "Scansiona il codice a barre di un prodotto." },
      "first-group": { description: "Insieme è più facile.", name: "Gruppo", title: "Primo gruppo", toGo: "Entra in un gruppo con un codice o un link." },
      "first-photo": { description: "Il tuo diario sembra già più appetitoso.", name: "Foto", title: "Prima foto di un pasto", toGo: "Aggiungi una foto a un pasto." },
      "first-voice": { description: "Senza scrivere niente.", name: "Voce", title: "Descritto a voce", toGo: "Di’ cosa hai mangiato invece di scriverlo." },
    },
    rule: "Prova tutti i modi per registrare e restare in contatto.",
    title: "Prime volte",
    weighIns: {
      description: "Conta l’andamento più di un singolo numero.",
      name: "Pesate",
      title: "10 pesate",
      toGo: (count) => `Ancora ${p(count, "pesata", "pesate")} da registrare.`,
    },
  },
  steps: {
    context: "Passi",
    inADay: (amount) => `${amount} in un giorno`,
    inOneDay: (amount) => `Fai ${amount} in un solo giorno.`,
    oftenEarned: ["Sette giorni sopra i 10.000. Sta diventando un’abitudine.", "Trenta giorni sopra i 10.000. Gambe d’acciaio."],
    oftenTitle: "10.000 passi",
    oftenToGo: (count, amount) => `Ancora ${days(count)} con ${amount} o più.`,
    rule: "I passi che fai in un giorno, da Apple Health.",
    targets: {
      5_000: "Una bella camminata. Un ottimo inizio.",
      10_000: "Il grande classico, e ce l’hai fatta.",
      15_000: "Per la maggior parte delle persone sono circa undici chilometri.",
      20_000: "Piedi in alto. Te lo sei meritato.",
    },
    title: "Passi",
  },
  burned: {
    context: "Calorie bruciate",
    inADay: (amount) => `${amount} bruciate in un giorno`,
    inOneDay: (amount) => `Brucia ${amount} muovendoti, in un solo giorno.`,
    oftenEarned: ["Sette giorni attivi. Il tuo corpo se ne accorge.", "Trenta giorni attivi. Notevole."],
    oftenTitle: "500 kcal bruciate",
    oftenToGo: (count, amount) => `Ancora ${days(count)} bruciando ${amount} o più.`,
    rule: "Le calorie che bruci muovendoti in un giorno, da Apple Health.",
    targets: {
      300: "Quanto un buon allenamento.",
      500: "Hai fatto sul serio. Si vede.",
      750: "Una giornata intensa. Bevi un po’ d’acqua.",
      1_000: "Una giornata enorme. Riposa bene e mangia come si deve.",
    },
    title: "Calorie bruciate",
  },
  assistant: {
    badges: {
      call: { description: "Bella chiacchierata. Si ricorda quello che hai detto.", name: "Chiamata", title: "Prima chiamata", toGo: () => "Parla dal vivo con il tuo coach." },
      "calls-5": { description: "Certe cose è meglio dirle a voce.", name: "5 chiamate", title: "5 chiamate", toGo: (count) => `${left(p(count, "chiamata", "chiamate"))}.` },
      chat: { description: "Chiedi quello che vuoi, quando vuoi. Conosce il tuo diario.", name: "Ciao", title: "Primo messaggio", toGo: () => "Scrivi al tuo coach." },
      "chats-50": { description: "Ormai vi conoscete bene.", name: "50 messaggi", title: "50 messaggi", toGo: (count) => `${left(p(count, "messaggio", "messaggi"))}.` },
      idea: { description: "Il tuo coach l’ha proposto, tu l’hai mangiato.", name: "Idea", title: "Buona idea", toGo: () => "Aggiungi un pasto proposto dal tuo coach." },
      "ideas-10": { description: "Avete proprio gli stessi gusti.", name: "10 idee", title: "10 idee mangiate", toGo: (count) => `Ancora ${p(count, "idea", "idee")} da aggiungere.` },
      photo: { description: "Un’immagine vale più di mille parole. Funziona anche con i menu.", name: "Foto", title: "Mostra e chiedi", toGo: () => "Invia una foto al tuo coach, per esempio un menu." },
      recipe: { description: "Ti aspetta in “Registra un pasto” ogni volta che cucini.", name: "Ricetta", title: "Prima ricetta", toGo: () => "Chiedi una ricetta al tuo coach e salvala." },
      reply: { description: "Un tocco su “Oggi” e state già parlando.", name: "Risposta", title: "Hai ripreso il filo", toGo: () => "Tocca il messaggio del tuo coach in “Oggi”." },
      voice: { description: "Più facile che scrivere quando hai le mani occupate.", name: "Messaggio vocale", title: "Primo messaggio vocale", toGo: () => "Invia un messaggio vocale al tuo coach." },
    },
    context: "Assistente",
    minutes: (minutes) => {
      const span = minutes < 60 ? `${minutes} min` : p(minutes / 60, "ora", "ore");
      return {
        description: minutes < 60 ? "Un buon inizio per te e il tuo coach." : minutes < 300 ? "Tempo ben speso." : "Ormai siete vecchi amici.",
        name: span,
        title: `${minutes < 60 ? p(minutes, "minuto", "minuti") : span} insieme`,
        toGo: (count) => `Ancora ${p(Math.ceil(count), "minuto", "minuti")} con il tuo coach.`,
      };
    },
    rule: "Impara a conoscere il tuo coach: scrivi, parla, mostra e cucina.",
    title: "Assistente",
  },
};
