import { formatNumber, pluralForm } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Ukraine Ukrainian, informal "ти", like the app. Quotes are « »; no space before ":", "!" and "?".
// We don't know anyone's gender, so no past tense about the user: present tense, "-но/-то" forms or labels.
// "Left" lines start with "Ще", so no verb has to agree with the number.
const number = (value: number) => formatNumber("uk", value);

// "1 день", "2 дні", "5 днів", "21 день" (21 is "one", as in Russian); fractions take the genitive
// singular ("1,5 дня").
function p(count: number, one: string, few: string, many: string, other: string): string {
  return `${number(count)} ${pluralForm("uk", count, { few, many, one, other })}`;
}

const UNITS: Record<Unit, [one: string, few: string, many: string, other: string]> = {
  calls: ["розмова", "розмови", "розмов", "розмови"],
  days: ["день", "дні", "днів", "дня"],
  foods: ["продукт", "продукти", "продуктів", "продукту"],
  ideas: ["ідея", "ідеї", "ідей", "ідеї"],
  kcal: ["ккал", "ккал", "ккал", "ккал"],
  kg: ["кг", "кг", "кг", "кг"],
  messages: ["повідомлення", "повідомлення", "повідомлень", "повідомлення"],
  minutes: ["хвилина", "хвилини", "хвилин", "хвилини"],
  steps: ["крок", "кроки", "кроків", "кроку"],
  "weigh-ins": ["зважування", "зважування", "зважувань", "зважування"],
};

const days = (count: number) => p(count, ...UNITS.days);
// "1 день поспіль", "7 днів поспіль".
const inARow = (count: number) => `${days(count)} поспіль`;

export const uk: AchievementCopy = {
  count: (value, unit) => p(value, ...UNITS[unit]),
  locale: "uk",
  notStarted: "Ще не розпочато",
  number,
  toGo: (count, unit) => `Ще ${unit ? p(count, ...UNITS[unit]) : number(count)}.`,
  unlocked: "Отримано",

  streak: {
    daysToGo: (count) => `Ще ${days(count)}`,
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Додай сьогодні прийом їжі, щоб почати серію.";
      const standing = current === best ? "Це твоя найкраща серія." : `Твоя найкраща серія: ${days(best)}.`;
      return loggedToday ? `${standing} Сьогодні вже записано.` : `${standing} Додай сьогодні прийом їжі, щоб її не перервати.`;
    },
    next: (title) => `Наступний значок: ${title}`,
  },
  streaks: {
    badgeTitle: inARow,
    context: "Днів поспіль",
    rule: "Додавай щонайменше один прийом їжі щодня.",
    tiers: {
      3: { description: "Три дні поспіль, щодня щонайменше один записаний прийом їжі.", name: "3 дні" },
      7: { description: "Цілий тиждень записів. Так починаються звички.", name: "7 днів" },
      14: { description: "Два тижні записів без перерви.", name: "14 днів" },
      30: { description: "Цілий місяць записів. Це вже звичка.", name: "30 днів" },
      100: { description: "Сто днів поспіль. Сюди доходять одиниці.", name: "100 днів" },
      365: { description: "Рік записів, день у день.", name: "1 рік" },
    },
    title: "Серії",
    toGo: (count) => `Ще ${inARow(count)} із записаним прийомом їжі.`,
  },
  tiers: { 7: "7 днів", 30: "1 місяць", 365: "1 рік" },
  protein: {
    context: "Ціль щодо білків",
    describe: (count) => `Твої м’язи це відчувають. ${days(count)} із ціллю щодо білків.`,
    rule: (grams) => (grams ? `З’їж за день щонайменше ${grams} г білків.` : "Встанови ціль щодо білків і досягни її за день."),
    title: "Ціль щодо білків",
    toGo: (count, grams) => (grams ? `Ще ${days(count)} зі щонайменше ${grams} г білків.` : "Встанови ціль щодо білків, щоб почати."),
  },
  calories: {
    badgeTitle: "У нормі",
    context: "Калорії в нормі",
    describe: (count) => `${days(count)} у межах 10% від цілі. Оце баланс.`,
    rule: (kcal) =>
      kcal
        ? `Тримайся за день у межах 10% від ${number(kcal)} ккал.`
        : "Встанови ціль щодо калорій і тримайся за день у межах 10% від неї.",
    title: "Калорії в нормі",
    toGo: (count, kcal) => (kcal ? `Ще ${days(count)} у межах 10% від цілі щодо калорій.` : "Встанови ціль щодо калорій, щоб почати."),
  },
  weight: {
    context: "Вага",
    goalDescription: (kg) => `Ціль досягнуто: ${kg} кг.`,
    goalName: "Ціль",
    goalTitle: (kg) => `Цільова вага · ${kg} кг`,
    // A label, so the numbers needn't follow "від" / "до".
    rule: (from, to) => (from && to ? `Етапи на шляху: ${from} кг → ${to} кг.` : "Етапи на шляху до цільової ваги."),
    steps: {
      "gain-1": { description: "Перший кілограм додано. Так тримати.", title: "Перший кілограм угору" },
      "gain-5": { description: "На п’ять кілограмів більше, ніж на старті.", title: "Плюс п’ять кілограмів" },
      "lose-1": { description: "Перший кілограм позаду. Так тримати.", title: "Перший кілограм униз" },
      "lose-5": { description: "На п’ять кілограмів менше, ніж на старті.", title: "Мінус п’ять кілограмів" },
    },
    title: "Вага",
    toGo: (kg) => `Ще ${kg} кг.`,
  },
  firsts: {
    context: "Уперше",
    foods: {
      description: "Твій щоденник уже добре тебе знає.",
      name: "100 продуктів",
      title: "100 продуктів записано",
      toGo: (count) => `Запиши ще ${p(count, ...UNITS.foods)}.`,
    },
    once: {
      "first-barcode": { description: "Наводиш, пік — і записано. Ось і все.", name: "Штрихкод", title: "Перший штрихкод", toGo: "Відскануй штрихкод на упаковці." },
      "first-group": { description: "Разом легше.", name: "Група", title: "Перша група", toGo: "Приєднайся до групи за кодом або посиланням." },
      "first-photo": { description: "Твій щоденник уже виглядає смачніше.", name: "Фото", title: "Перше фото їжі", toGo: "Додай фото до прийому їжі." },
      "first-voice": { description: "Без набору тексту.", name: "Голос", title: "Голосом", toGo: "Скажи, що їси, замість того щоб писати." },
    },
    rule: "Спробуй усі способи записувати й спілкуватися.",
    title: "Уперше",
    weighIns: {
      description: "Тенденція важливіша за будь-яке окреме число.",
      name: "Зважування",
      title: "10 зважувань",
      toGo: (count) => `Запиши ще ${p(count, ...UNITS["weigh-ins"])}.`,
    },
  },
  steps: {
    context: "Кроки",
    inADay: (amount) => `${amount} за день`,
    inOneDay: (amount) => `Пройди ${amount} за один день.`,
    oftenEarned: ["Сім днів понад 10 000. Це стає звичкою.", "Тридцять днів понад 10 000. Сильні ноги."],
    oftenTitle: "10 000 кроків",
    oftenToGo: (count, amount) => `Ще ${days(count)} із результатом ${amount} або більше.`,
    rule: "Кроки, які ти проходиш за день, з Apple Health.",
    targets: {
      5_000: "Добра прогулянка. Чудовий початок.",
      10_000: "Класика — і в тебе вийшло.",
      15_000: "Для більшості це близько одинадцяти кілометрів.",
      20_000: "Ноги вгору. Ти на це заслуговуєш.",
    },
    title: "Кроки",
  },
  burned: {
    context: "Спалені калорії",
    // "Спалено" is impersonal, so it reads right for any amount.
    inADay: (amount) => `Спалено ${amount} за день`,
    inOneDay: (amount) => `Спали ${amount} рухом за один день.`,
    oftenEarned: ["Сім активних днів. Твоє тіло це помічає.", "Тридцять активних днів. Вражає."],
    oftenTitle: "Спалено 500 ккал",
    oftenToGo: (count, amount) => `Ще ${days(count)} із результатом ${amount} або більше.`,
    rule: "Калорії, які ти спалюєш рухом за день, з Apple Health.",
    targets: {
      300: "Як добре, повноцінне тренування.",
      500: "Багато руху. Це видно.",
      750: "Великий день. Випий води.",
      1_000: "Величезний день. Добре відпочинь і нормально поїж.",
    },
    title: "Спалені калорії",
  },
  assistant: {
    badges: {
      call: { description: "Добра розмова. Тренер пам’ятає, що ти кажеш.", name: "Розмова", title: "Перша розмова", toGo: () => "Поговори з тренером наживо." },
      "calls-5": { description: "Деякі речі краще сказати вголос.", name: "5 розмов", title: "5 розмов", toGo: (count) => `Ще ${p(count, ...UNITS.calls)}.` },
      chat: { description: "Питай що завгодно й коли завгодно. Тренер знає твій щоденник.", name: "Привіт", title: "Перше повідомлення", toGo: () => "Напиши своєму тренерові." },
      "chats-50": { description: "Ви вже добре знаєте одне одного.", name: "50 повідомлень", title: "50 повідомлень", toGo: (count) => `Ще ${p(count, ...UNITS.messages)}.` },
      idea: { description: "Ідея тренера, твоя тарілка.", name: "Ідея", title: "Добра ідея", toGo: () => "Додай страву, яку пропонує тренер." },
      // "Додай ще 1 ідею": the accusative.
      "ideas-10": { description: "Схоже, у вас подібні смаки.", name: "10 ідей", title: "10 з’їдених ідей", toGo: (count) => `Додай ще ${p(count, "ідею", "ідеї", "ідей", "ідеї")}.` },
      photo: { description: "Краще один раз побачити. Меню теж підійде.", name: "Фото", title: "Покажи й запитай", toGo: () => "Надішли тренерові фото, наприклад меню." },
      recipe: { description: "Чекає в «Додати їжу», коли збираєшся готувати.", name: "Рецепт", title: "Перший рецепт", toGo: () => "Попроси в тренера рецепт і збережи його." },
      reply: { description: "Один дотик на «Сьогодні» — і розмова вже йде.", name: "Відповідь", title: "Розмову підхоплено", toGo: () => "Торкнись повідомлення тренера на «Сьогодні»." },
      voice: { description: "Легше, ніж писати, коли руки зайняті.", name: "Голосове", title: "Перше голосове", toGo: () => "Надішли тренерові голосове повідомлення." },
    },
    context: "Асистент",
    minutes: (minutes) => {
      // 90 minutes is "1,5 години" (the fraction form).
      const span = minutes < 60 ? `${minutes} хв` : p(minutes / 60, "година", "години", "годин", "години");
      return {
        description: minutes < 60 ? "Добрий початок для тебе й тренера." : minutes < 300 ? "Добре проведений час." : "Майже старі друзі.",
        name: span,
        title: `Разом: ${minutes < 60 ? p(minutes, ...UNITS.minutes) : span}`,
        toGo: (count) => `Ще ${p(Math.ceil(count), ...UNITS.minutes)} з тренером.`,
      };
    },
    rule: "Познайомся з тренером: пиши, говори, показуй і готуй.",
    title: "Асистент",
  },
};
