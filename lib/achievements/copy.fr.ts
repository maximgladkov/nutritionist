import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Informal "tu", like the app. French puts a narrow no-break space ( ) before ":", "!" and
// "?", inside « », and between thousands ("10 000"), which formatNumber does too.
const number = (value: number) => formatNumber("fr", value);

// French says the singular below 2: "0 jour", "1 jour", "2 jours".
function p(count: number, one: string, other: string): string {
  return `${number(count)} ${pluralForm("fr", count, { one, other })}`;
}

const UNITS: Record<Unit, [one: string, other: string]> = {
  calls: ["appel", "appels"],
  days: ["jour", "jours"],
  foods: ["aliment", "aliments"],
  ideas: ["idée", "idées"],
  kcal: ["kcal", "kcal"],
  kg: ["kg", "kg"],
  messages: ["message", "messages"],
  minutes: ["minute", "minutes"],
  steps: ["pas", "pas"],
  "weigh-ins": ["pesée", "pesées"],
};

const days = (count: number) => p(count, "jour", "jours");
// "Encore 1 jour", "Encore 3 jours".
const left = (amount: string) => `Encore ${amount}`;

export const fr: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "fr",
  notStarted: "Pas encore commencé",
  number,
  toGo: (count, unit) => `${left(unit ? p(count, ...UNITS[unit]) : number(count))}.`,
  unlocked: "Débloqué",

  streak: {
    daysToGo: (count) => left(days(count)),
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Note un repas aujourd’hui pour lancer une série.";
      const standing = current === best ? "Ta meilleure série jusqu’ici." : `Ta meilleure série : ${days(best)}.`;
      return loggedToday ? `${standing} Tu as déjà noté aujourd’hui.` : `${standing} Note un repas aujourd’hui pour la garder.`;
    },
    next: (title) => `Prochain badge : ${title}`,
  },
  streaks: {
    badgeTitle: (count) => `${count} ${count < 2 ? "jour" : "jours"} d’affilée`,
    context: "Jours d’affilée",
    rule: "Note au moins un repas chaque jour.",
    tiers: {
      3: { description: "Trois jours d’affilée avec au moins un repas noté.", name: "3 jours" },
      7: { description: "Une semaine entière notée. C’est comme ça que naissent les habitudes.", name: "7 jours" },
      14: { description: "Deux semaines notées sans en manquer une.", name: "14 jours" },
      30: { description: "Un mois entier noté. C’est devenu une habitude.", name: "30 jours" },
      100: { description: "Cent jours d’affilée. Très peu y arrivent.", name: "100 jours" },
      365: { description: "Une année entière notée, chaque jour sans exception.", name: "1 an" },
    },
    title: "Séries",
    toGo: (count) => `Encore ${days(count)} d’affilée avec un repas noté.`,
  },
  tiers: { 7: "7 jours", 30: "1 mois", 365: "1 an" },
  protein: {
    context: "Objectif protéines",
    describe: (count) => `Tes muscles l’ont remarqué. ${days(count)} qui comptent.`,
    rule: (grams) =>
      grams ? `Mange au moins ${grams} grammes de protéines dans la journée.` : "Fixe-toi un objectif de protéines et atteins-le dans la journée.",
    title: "Objectif protéines",
    toGo: (count, grams) =>
      grams ? `Encore ${days(count)} à ${grams} grammes de protéines.` : "Fixe-toi un objectif de protéines pour commencer.",
  },
  calories: {
    badgeTitle: "Dans l’objectif",
    context: "Calories dans l’objectif",
    describe: (count) => `${days(count)} à 10 % près de ton objectif. Ça, c’est l’équilibre.`,
    rule: (kcal) =>
      kcal
        ? `Reste à 10 % près de ${number(kcal)} kcal dans la journée.`
        : "Fixe-toi un objectif de calories et reste à 10 % près dans la journée.",
    title: "Calories dans l’objectif",
    toGo: (count, kcal) =>
      kcal ? `Encore ${days(count)} à 10 % près de ton objectif de calories.` : "Fixe-toi un objectif de calories pour commencer.",
  },
  weight: {
    context: "Poids",
    goalDescription: (kg) => `Tu as atteint ton objectif de ${kg} kg.`,
    goalName: "Objectif",
    goalTitle: (kg) => `Poids cible · ${kg} kg`,
    rule: (from, to) => (from && to ? `Des étapes sur le chemin de ${from} à ${to} kg.` : "Des étapes sur le chemin de ton poids cible."),
    steps: {
      "gain-1": { description: "Ton premier kilo en plus. Continue.", title: "Premier kilo pris" },
      "gain-5": { description: "Cinq kilos de plus qu’au départ.", title: "Cinq kilos pris" },
      "lose-1": { description: "Ton premier kilo en moins. Continue.", title: "Premier kilo perdu" },
      "lose-5": { description: "Cinq kilos de moins qu’au départ.", title: "Cinq kilos perdus" },
    },
    title: "Poids",
    toGo: (kg) => `Encore ${kg} kg.`,
  },
  firsts: {
    context: "Premières fois",
    foods: {
      description: "Ton journal commence à bien te connaître.",
      name: "100 aliments",
      title: "100 aliments notés",
      toGo: (count) => `Encore ${p(count, "aliment", "aliments")} à noter.`,
    },
    once: {
      "first-barcode": { description: "Tu vises, bip, c’est noté. Rien de plus.", name: "Code-barres", title: "Premier code-barres scanné", toGo: "Scanne le code-barres d’un produit." },
      "first-group": { description: "C’est plus facile à plusieurs.", name: "Groupe", title: "Tu as rejoint un groupe", toGo: "Rejoins un groupe avec un code ou un lien." },
      "first-photo": { description: "Ton journal a déjà l’air plus appétissant.", name: "Photo", title: "Première photo de repas", toGo: "Ajoute une photo à un repas." },
      "first-voice": { description: "Sans rien taper.", name: "Voix", title: "Décrit à la voix", toGo: "Dis ce que tu as mangé au lieu de le taper." },
    },
    rule: "Essaie toutes les façons de noter et de rester en contact.",
    title: "Premières fois",
    weighIns: {
      description: "La tendance compte plus qu’un chiffre isolé.",
      name: "Pesées",
      title: "10 pesées",
      toGo: (count) => `Encore ${p(count, "pesée", "pesées")} à noter.`,
    },
  },
  steps: {
    context: "Pas",
    inADay: (amount) => `${amount} en une journée`,
    inOneDay: (amount) => `Fais ${amount} en une seule journée.`,
    oftenEarned: ["Sept jours au-dessus de 10 000. Ça devient une habitude.", "Trente jours au-dessus de 10 000. De sacrées jambes."],
    oftenTitle: "10 000 pas",
    oftenToGo: (count, amount) => `Encore ${days(count)} à ${amount} ou plus.`,
    rule: "Les pas que tu fais dans la journée, depuis Apple Health.",
    targets: {
      5_000: "Une belle balade. Un super début.",
      10_000: "Le grand classique, et tu l’as fait.",
      15_000: "Pour la plupart des gens, ça fait environ onze kilomètres.",
      20_000: "Repose tes pieds. Tu l’as bien mérité.",
    },
    title: "Pas",
  },
  burned: {
    context: "Calories brûlées",
    inADay: (amount) => `${amount} brûlées en une journée`,
    inOneDay: (amount) => `Brûle ${amount} en bougeant, en une seule journée.`,
    oftenEarned: ["Sept jours actifs. Ton corps le sent.", "Trente jours actifs. Impressionnant."],
    oftenTitle: "500 kcal brûlées",
    oftenToGo: (count, amount) => `Encore ${days(count)} à ${amount} brûlées ou plus.`,
    rule: "Les calories que tu brûles en bougeant dans la journée, depuis Apple Health.",
    targets: {
      300: "L’équivalent d’une bonne séance de sport.",
      500: "Tu as vraiment bougé. Ça se voit.",
      750: "Une grosse journée. Pense à boire de l’eau.",
      1_000: "Une journée énorme. Repose-toi bien et mange correctement.",
    },
    title: "Calories brûlées",
  },
  assistant: {
    badges: {
      call: { description: "Belle discussion. Il se souvient de ce que tu as dit.", name: "Appel", title: "Premier appel", toGo: () => "Parle en direct avec ton coach." },
      "calls-5": { description: "Certaines choses passent mieux à voix haute.", name: "5 appels", title: "5 appels", toGo: (count) => `${left(p(count, "appel", "appels"))}.` },
      chat: { description: "Demande ce que tu veux, quand tu veux. Il connaît ton journal.", name: "Salut", title: "Premier message", toGo: () => "Écris à ton coach." },
      "chats-50": { description: "Vous vous connaissez bien maintenant.", name: "50 messages", title: "50 messages", toGo: (count) => `${left(p(count, "message", "messages"))}.` },
      idea: { description: "Ton coach l’a proposé, tu l’as mangé.", name: "Idée", title: "Bonne idée", toGo: () => "Ajoute un repas proposé par ton coach." },
      "ideas-10": { description: "Vous avez clairement les mêmes goûts.", name: "10 idées", title: "10 idées mangées", toGo: (count) => `Encore ${p(count, "idée", "idées")} à ajouter.` },
      photo: { description: "Une image vaut mille mots. Les menus aussi, ça marche.", name: "Photo", title: "Montre et demande", toGo: () => "Envoie une photo à ton coach, par exemple un menu." },
      recipe: { description: "Elle t’attend dans « Noter un repas » chaque fois que tu cuisines.", name: "Recette", title: "Première recette", toGo: () => "Demande une recette à ton coach et enregistre-la." },
      reply: { description: "Une touche sur « Aujourd’hui » et vous discutez.", name: "Réponse", title: "Tu as repris le fil", toGo: () => "Touche le message de ton coach dans « Aujourd’hui »." },
      voice: { description: "Plus simple que taper quand tu as les mains prises.", name: "Message vocal", title: "Premier message vocal", toGo: () => "Envoie un message vocal à ton coach." },
    },
    context: "Assistant",
    minutes: (minutes) => {
      const span = minutes < 60 ? `${minutes} min` : p(minutes / 60, "heure", "heures");
      return {
        description: minutes < 60 ? "Un bon début pour toi et ton coach." : minutes < 300 ? "Du temps bien investi." : "Presque de vieux amis.",
        name: span,
        title: `${minutes < 60 ? p(minutes, "minute", "minutes") : span} ensemble`,
        toGo: (count) => `Encore ${p(Math.ceil(count), "minute", "minutes")} avec ton coach.`,
      };
    },
    rule: "Apprends à connaître ton coach : écris, parle, montre et cuisine.",
    title: "Assistant",
  },
};
