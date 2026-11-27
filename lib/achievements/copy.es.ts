import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

const number = (value: number) => formatNumber("es", value);

function p(count: number, one: string, other: string): string {
  return `${number(count)} ${pluralForm("es", count, { one, other })}`;
}

const UNITS: Record<Unit, [one: string, other: string]> = {
  calls: ["llamada", "llamadas"],
  days: ["día", "días"],
  foods: ["alimento", "alimentos"],
  ideas: ["idea", "ideas"],
  kcal: ["kcal", "kcal"],
  kg: ["kg", "kg"],
  messages: ["mensaje", "mensajes"],
  minutes: ["minuto", "minutos"],
  steps: ["pasos", "pasos"],
  "weigh-ins": ["pesaje", "pesajes"],
};

const days = (count: number) => p(count, "día", "días");
// "1 día más", "3 días más".
const moreDays = (count: number) => `${days(count)} más`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
// "Falta 1 llamada", "Faltan 4 llamadas".
const left = (count: number, amount: string) => `${count === 1 ? "Falta" : "Faltan"} ${amount}`;

export const es: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "es",
  notStarted: "Sin empezar",
  number,
  toGo: (count, unit) => `${left(count, unit ? p(count, ...UNITS[unit]) : number(count))}.`,
  unlocked: "Conseguida",

  streak: {
    daysToGo: (count) => left(count, days(count)),
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Registra una comida hoy para empezar una racha.";
      const standing = current === best ? "Es tu mejor racha." : `Tu mejor racha es de ${days(best)}.`;
      return loggedToday ? `${standing} Hoy ya registraste.` : `${standing} Registra una comida hoy para no perderla.`;
    },
    next: (title) => `La siguiente: ${title}`,
  },
  streaks: {
    badgeTitle: (count) => `Racha de ${days(count)}`,
    context: "Días de racha",
    rule: "Registra al menos una comida cada día.",
    tiers: {
      3: { description: "Tres días seguidos con al menos una comida registrada.", name: "3 días" },
      7: { description: "Una semana entera registrando. Así empiezan los hábitos.", name: "7 días" },
      14: { description: "Dos semanas registrando sin saltarte ni un día.", name: "14 días" },
      30: { description: "Un mes entero registrando. Ya es un hábito.", name: "30 días" },
      100: { description: "Cien días seguidos. Pocos llegan hasta aquí.", name: "100 días" },
      365: { description: "Un año registrando, todos y cada uno de los días.", name: "1 año" },
    },
    title: "Rachas",
    toGo: (count) => `${capital(moreDays(count))} de racha registrando una comida.`,
  },
  tiers: { 7: "7 días", 30: "1 mes", 365: "1 año" },
  protein: {
    context: "Meta de proteína",
    describe: (count) => `Tus músculos lo notaron. ${capital(days(count))} para presumir.`,
    rule: (grams) =>
      grams ? `Come al menos ${grams} gramos de proteína en un día.` : "Ponte una meta de proteína y alcánzala en un día.",
    title: "Meta de proteína",
    toGo: (left, grams) =>
      grams ? `${capital(moreDays(left))} con ${grams} gramos de proteína.` : "Ponte una meta de proteína para empezar esta.",
  },
  calories: {
    badgeTitle: "En el objetivo",
    context: "Calorías en el objetivo",
    describe: (count) => `A menos de un 10% de tu meta durante ${days(count)}. Eso es equilibrio.`,
    rule: (kcal) =>
      kcal
        ? `Quédate a menos de un 10% de ${number(kcal)} kcal en el día.`
        : "Ponte una meta de calorías y quédate a menos de un 10% de ella en el día.",
    title: "Calorías en el objetivo",
    toGo: (left, kcal) =>
      kcal ? `${capital(moreDays(left))} a menos de un 10% de tu meta de calorías.` : "Ponte una meta de calorías para empezar esta.",
  },
  weight: {
    context: "Peso",
    goalDescription: (kg) => `Alcanzaste tu meta de ${kg} kg.`,
    goalName: "Meta",
    goalTitle: (kg) => `Peso meta · ${kg} kg`,
    rule: (from, to) => (from && to ? `Hitos en el camino de ${from} a ${to} kg.` : "Hitos en el camino hacia tu peso meta."),
    steps: {
      "gain-1": { description: "Ganaste tu primer kilo. Sigue así.", title: "Primer kilo ganado" },
      "gain-5": { description: "Cinco kilos más que cuando empezaste.", title: "Cinco kilos ganados" },
      "lose-1": { description: "Perdiste tu primer kilo. Sigue así.", title: "Primer kilo menos" },
      "lose-5": { description: "Cinco kilos menos que cuando empezaste.", title: "Cinco kilos menos" },
    },
    title: "Peso",
    toGo: (kg) => `${kg === "1" ? "Falta" : "Faltan"} ${kg} kg.`,
  },
  firsts: {
    context: "Primera vez",
    foods: {
      description: "Tu diario ya te conoce bien.",
      name: "100 alimentos",
      title: "100 alimentos registrados",
      toGo: (left) => `Registra ${p(left, "alimento", "alimentos")} más.`,
    },
    once: {
      "first-barcode": { description: "Apuntas, pita y listo. Así de fácil.", name: "Código", title: "Primer código de barras", toGo: "Escanea el código de barras de un producto." },
      "first-group": { description: "Juntos es más fácil.", name: "Grupo", title: "Te uniste a un grupo", toGo: "Únete a un grupo con un código o un enlace." },
      "first-photo": { description: "Tu diario ya se ve más apetitoso.", name: "Foto", title: "Primera foto de comida", toGo: "Añade una foto a una comida." },
      "first-voice": { description: "Sin escribir nada.", name: "Voz", title: "Cuéntalo con la voz", toGo: "Di lo que comiste en vez de escribirlo." },
    },
    rule: "Prueba todas las formas de registrar y conectar.",
    title: "Primeras veces",
    weighIns: {
      description: "La tendencia importa más que cualquier número suelto.",
      name: "Pesajes",
      title: "10 pesajes",
      toGo: (left) => `Registra ${p(left, "pesaje", "pesajes")} más.`,
    },
  },
  steps: {
    context: "Pasos",
    inADay: (amount) => `${amount} en un día`,
    inOneDay: (amount) => `Camina ${amount} en un solo día.`,
    oftenEarned: ["Siete días por encima de 10.000. Se está volviendo un hábito.", "Treinta días por encima de 10.000. Piernas fuertes."],
    oftenTitle: "10.000 pasos",
    oftenToGo: (left, amount) => `${capital(moreDays(left))} caminando ${amount} o más.`,
    rule: "Los pasos que caminas en un día, desde Apple Health.",
    targets: {
      5_000: "Un buen paseo. Un gran punto de partida.",
      10_000: "El clásico, y lo lograste.",
      15_000: "Para la mayoría, son unos once kilómetros.",
      20_000: "A descansar los pies. Te lo has ganado.",
    },
    title: "Pasos",
  },
  burned: {
    context: "Calorías quemadas",
    inADay: (amount) => `${amount} quemadas en un día`,
    inOneDay: (amount) => `Quema ${amount} moviéndote en un solo día.`,
    oftenEarned: ["Siete días activos. Tu cuerpo lo nota.", "Treinta días activos. Impresionante."],
    oftenTitle: "500 kcal quemadas",
    oftenToGo: (left, amount) => `${capital(moreDays(left))} quemando ${amount} o más.`,
    rule: "Las calorías que quemas moviéndote en un día, desde Apple Health.",
    targets: {
      300: "Lo que vale un buen entrenamiento.",
      500: "Te moviste de verdad. Se nota.",
      750: "Un gran día. Bebe algo de agua.",
      1_000: "Un día enorme. Descansa bien y come como es debido.",
    },
    title: "Calorías quemadas",
  },
  assistant: {
    badges: {
      call: { description: "Buena conversación. Recuerda lo que dijiste.", name: "Llamada", title: "Primera llamada", toGo: () => "Habla en directo con tu coach." },
      "calls-5": { description: "Hay cosas que se dicen mejor en voz alta.", name: "5 llamadas", title: "5 llamadas", toGo: (count) => `${left(count, p(count, "llamada", "llamadas"))}.` },
      chat: { description: "Pregunta lo que quieras, cuando quieras. Conoce tu diario.", name: "Hola", title: "Primer mensaje", toGo: () => "Escríbele a tu coach." },
      "chats-50": { description: "A estas alturas ya se conocen bien.", name: "50 mensajes", title: "50 mensajes", toGo: (count) => `${left(count, p(count, "mensaje", "mensajes"))}.` },
      idea: { description: "Tu coach lo sugirió y tú te lo comiste.", name: "Idea", title: "Buena idea", toGo: () => "Añade una comida que te sugiera tu coach." },
      "ideas-10": { description: "Está claro que comparten gustos.", name: "10 ideas", title: "10 ideas comidas", toGo: (left) => `Añade ${p(left, "idea", "ideas")} más.` },
      photo: { description: "Una imagen vale más que mil palabras. Los menús también sirven.", name: "Foto", title: "Enséñalo y pregunta", toGo: () => "Mándale a tu coach una foto, como un menú." },
      recipe: { description: "Te espera en Registrar comida cuando vayas a cocinar.", name: "Receta", title: "Primera receta", toGo: () => "Pídele una receta a tu coach y guárdala." },
      reply: { description: "Un toque en Hoy y ya están hablando.", name: "Respuesta", title: "Retomaste la charla", toGo: () => "Toca el mensaje de tu coach en Hoy." },
      voice: { description: "Más fácil que escribir con las manos ocupadas.", name: "Nota de voz", title: "Primera nota de voz", toGo: () => "Mándale a tu coach una nota de voz." },
    },
    context: "Asistente",
    minutes: (minutes) => {
      const span = minutes < 60 ? `${minutes} min` : p(minutes / 60, "hora", "horas");
      return {
        description: minutes < 60 ? "Buen comienzo para ti y tu coach." : minutes < 300 ? "Tiempo bien invertido." : "Ya son casi viejos amigos.",
        name: span,
        title: `${minutes < 60 ? p(minutes, "minuto", "minutos") : capital(span)} juntos`,
        toGo: (left) => `${capital(p(Math.ceil(left), "minuto", "minutos"))} más con tu coach.`,
      };
    },
    rule: "Conoce a tu coach: escribe, habla, enseña y cocina.",
    title: "Asistente",
  },
};
