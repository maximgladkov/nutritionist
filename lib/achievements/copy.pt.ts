import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Brazilian Portuguese, informal "você", like the app. No space before ":", "!" and "?"; quotes are “ ”.
// A badge is "medalha" (feminine), as the app calls it.
const number = (value: number) => formatNumber("pt", value);

// Portuguese says the singular below 2: "0 dia", "1 dia", "2 dias".
function p(count: number, one: string, other: string): string {
  return `${number(count)} ${pluralForm("pt", count, { one, other })}`;
}

const UNITS: Record<Unit, [one: string, other: string]> = {
  calls: ["chamada", "chamadas"],
  days: ["dia", "dias"],
  foods: ["alimento", "alimentos"],
  ideas: ["ideia", "ideias"],
  kcal: ["kcal", "kcal"],
  kg: ["kg", "kg"],
  messages: ["mensagem", "mensagens"],
  minutes: ["minuto", "minutos"],
  steps: ["passo", "passos"],
  "weigh-ins": ["pesagem", "pesagens"],
};

const days = (count: number) => p(count, "dia", "dias");
// "1 dia seguido", "7 dias seguidos".
const inARow = (count: number) => `${days(count)} ${pluralForm("pt", count, { one: "seguido", other: "seguidos" })}`;
// "Falta 1 dia", "Faltam 3 dias": the verb agrees with the count.
const left = (count: number, amount: string) => `${pluralForm("pt", count, { one: "Falta", other: "Faltam" })} ${amount}`;

export const pt: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "pt",
  notStarted: "Ainda não começou",
  number,
  toGo: (count, unit) => `${left(count, unit ? p(count, ...UNITS[unit]) : number(count))}.`,
  unlocked: "Desbloqueada",

  streak: {
    daysToGo: (count) => left(count, days(count)),
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Registre uma refeição hoje para começar uma sequência.";
      const standing = current === best ? "Sua melhor sequência até agora." : `Sua melhor sequência: ${days(best)}.`;
      return loggedToday ? `${standing} Você já registrou hoje.` : `${standing} Registre uma refeição hoje para não perdê-la.`;
    },
    next: (title) => `Próxima medalha: ${title}`,
  },
  streaks: {
    badgeTitle: inARow,
    context: "Dias seguidos",
    rule: "Registre pelo menos uma refeição por dia.",
    tiers: {
      3: { description: "Três dias seguidos com pelo menos uma refeição registrada.", name: "3 dias" },
      7: { description: "Uma semana inteira de registros. É assim que nascem os hábitos.", name: "7 dias" },
      14: { description: "Duas semanas de registros sem pular nenhum dia.", name: "14 dias" },
      30: { description: "Um mês inteiro de registros. Agora já é um hábito.", name: "30 dias" },
      100: { description: "Cem dias seguidos. Pouca gente chega aqui.", name: "100 dias" },
      365: { description: "Um ano inteiro de registros, todos os dias.", name: "1 ano" },
    },
    title: "Sequências",
    toGo: (count) => `${left(count, inARow(count))} com uma refeição registrada.`,
  },
  tiers: { 7: "7 dias", 30: "1 mês", 365: "1 ano" },
  protein: {
    context: "Meta de proteínas",
    describe: (count) => `Seus músculos perceberam. ${days(count)} para se orgulhar.`,
    rule: (grams) =>
      grams ? `Coma pelo menos ${grams} gramas de proteínas em um dia.` : "Defina uma meta de proteínas e alcance-a em um dia.",
    title: "Meta de proteínas",
    toGo: (count, grams) =>
      grams ? `${left(count, days(count))} com ${grams} gramas de proteínas.` : "Defina uma meta de proteínas para começar.",
  },
  calories: {
    badgeTitle: "Dentro da meta",
    context: "Calorias dentro da meta",
    describe: (count) => `A até 10% da sua meta por ${days(count)}. Isso é equilíbrio.`,
    rule: (kcal) =>
      kcal
        ? `Fique a até 10% de ${number(kcal)} kcal no dia.`
        : "Defina uma meta de calorias e fique a até 10% dela no dia.",
    title: "Calorias dentro da meta",
    toGo: (count, kcal) =>
      kcal ? `${left(count, days(count))} a até 10% da sua meta de calorias.` : "Defina uma meta de calorias para começar.",
  },
  weight: {
    context: "Peso",
    goalDescription: (kg) => `Você chegou à sua meta de ${kg} kg.`,
    goalName: "Meta",
    goalTitle: (kg) => `Meta de peso · ${kg} kg`,
    rule: (from, to) => (from && to ? `Os marcos no caminho de ${from} a ${to} kg.` : "Os marcos no caminho até a sua meta de peso."),
    steps: {
      "gain-1": { description: "Seu primeiro quilo a mais. Continue assim.", title: "Primeiro quilo a mais" },
      "gain-5": { description: "Cinco quilos a mais do que no começo.", title: "Cinco quilos a mais" },
      "lose-1": { description: "Seu primeiro quilo a menos. Continue assim.", title: "Primeiro quilo a menos" },
      "lose-5": { description: "Cinco quilos a menos do que no começo.", title: "Cinco quilos a menos" },
    },
    title: "Peso",
    // `kg` comes written out ("1,5"); below 2 the verb is singular.
    toGo: (kg) => `${Number(kg.replace(",", ".")) < 2 ? "Falta" : "Faltam"} ${kg} kg.`,
  },
  firsts: {
    context: "Primeiras vezes",
    foods: {
      description: "Seu diário já conhece você bem.",
      name: "100 alimentos",
      title: "100 alimentos registrados",
      toGo: (count) => `${left(count, p(count, "alimento", "alimentos"))} para registrar.`,
    },
    once: {
      "first-barcode": { description: "Apontou, bipou, registrou. Simples assim.", name: "Código de barras", title: "Primeiro código de barras escaneado", toGo: "Escaneie o código de barras de um produto." },
      "first-group": { description: "Em grupo fica mais fácil.", name: "Grupo", title: "Primeiro grupo", toGo: "Entre em um grupo com um código ou um link." },
      "first-photo": { description: "Seu diário já parece mais apetitoso.", name: "Foto", title: "Primeira foto de refeição", toGo: "Adicione uma foto a uma refeição." },
      "first-voice": { description: "Sem digitar nada.", name: "Voz", title: "Descrito por voz", toGo: "Diga o que você comeu em vez de digitar." },
    },
    rule: "Experimente todas as formas de registrar e se conectar.",
    title: "Primeiras vezes",
    weighIns: {
      description: "A tendência importa mais do que qualquer número isolado.",
      name: "Pesagens",
      title: "10 pesagens",
      toGo: (count) => `${left(count, p(count, "pesagem", "pesagens"))} para registrar.`,
    },
  },
  steps: {
    context: "Passos",
    inADay: (amount) => `${amount} em um dia`,
    inOneDay: (amount) => `Dê ${amount} em um único dia.`,
    oftenEarned: ["Sete dias acima de 10.000. Está virando hábito.", "Trinta dias acima de 10.000. Pernas de aço."],
    oftenTitle: "10.000 passos",
    oftenToGo: (count, amount) => `${left(count, days(count))} com ${amount} ou mais.`,
    rule: "Os passos que você dá em um dia, do Apple Health.",
    targets: {
      5_000: "Uma boa caminhada. Ótimo começo.",
      10_000: "O clássico, e você conseguiu.",
      15_000: "Para a maioria das pessoas, são uns onze quilômetros.",
      20_000: "Pés para o alto. Você mereceu.",
    },
    title: "Passos",
  },
  burned: {
    context: "Calorias queimadas",
    inADay: (amount) => `${amount} queimadas em um dia`,
    inOneDay: (amount) => `Queime ${amount} se movimentando, em um único dia.`,
    oftenEarned: ["Sete dias ativos. Seu corpo percebe.", "Trinta dias ativos. Impressionante."],
    oftenTitle: "500 kcal queimadas",
    oftenToGo: (count, amount) => `${left(count, days(count))} queimando ${amount} ou mais.`,
    rule: "As calorias que você queima se movimentando em um dia, do Apple Health.",
    targets: {
      300: "Como um bom treino.",
      500: "Você levou a sério. Dá para ver.",
      750: "Um dia puxado. Beba uma água.",
      1_000: "Um dia enorme. Descanse bem e coma direito.",
    },
    title: "Calorias queimadas",
  },
  assistant: {
    badges: {
      call: { description: "Boa conversa. Seu coach lembra o que você disse.", name: "Chamada", title: "Primeira chamada", toGo: () => "Converse ao vivo com seu coach." },
      "calls-5": { description: "Tem coisas que é melhor dizer em voz alta.", name: "5 chamadas", title: "5 chamadas", toGo: (count) => `${left(count, p(count, "chamada", "chamadas"))}.` },
      chat: { description: "Pergunte o que quiser, quando quiser. Seu coach conhece seu diário.", name: "Oi", title: "Primeira mensagem", toGo: () => "Escreva para seu coach." },
      "chats-50": { description: "Vocês já se conhecem bem.", name: "50 mensagens", title: "50 mensagens", toGo: (count) => `${left(count, p(count, "mensagem", "mensagens"))}.` },
      idea: { description: "Seu coach sugeriu, você comeu.", name: "Ideia", title: "Boa ideia", toGo: () => "Adicione uma refeição sugerida pelo seu coach." },
      "ideas-10": { description: "Vocês têm mesmo o mesmo gosto.", name: "10 ideias", title: "10 ideias no prato", toGo: (count) => `${left(count, p(count, "ideia", "ideias"))} para adicionar.` },
      photo: { description: "Uma imagem vale mais que mil palavras. Funciona com cardápios também.", name: "Foto", title: "Mostre e pergunte", toGo: () => "Envie uma foto para seu coach, por exemplo um cardápio." },
      recipe: { description: "Ela fica esperando em “Registrar refeição” sempre que você cozinhar.", name: "Receita", title: "Primeira receita", toGo: () => "Peça uma receita ao seu coach e salve-a." },
      reply: { description: "Um toque em “Hoje” e vocês já estão conversando.", name: "Resposta", title: "Retomou a conversa", toGo: () => "Toque na mensagem do seu coach em “Hoje”." },
      voice: { description: "Mais fácil do que digitar quando você está com as mãos ocupadas.", name: "Mensagem de voz", title: "Primeira mensagem de voz", toGo: () => "Envie uma mensagem de voz para seu coach." },
    },
    context: "Assistente",
    minutes: (minutes) => {
      const span = minutes < 60 ? `${minutes} min` : p(minutes / 60, "hora", "horas");
      return {
        description: minutes < 60 ? "Um bom começo para você e seu coach." : minutes < 300 ? "Tempo bem gasto." : "Uma amizade de longa data.",
        name: span,
        title: `${minutes < 60 ? p(minutes, "minuto", "minutos") : span} de conversa`,
        toGo: (count) => `${left(Math.ceil(count), p(Math.ceil(count), "minuto", "minutos"))} com seu coach.`,
      };
    },
    rule: "Conheça seu coach: escreva, converse, mostre e cozinhe.",
    title: "Assistente",
  },
};
