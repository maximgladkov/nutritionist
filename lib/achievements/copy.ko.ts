import { formatNumber } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// South Korean, polite 해요체 in sentences, short nouns on labels. Quotes are ‘ ’; ASCII ": " and "!".
// No plurals: a number takes its counter straight after it ("7일", "10,000걸음"), while kcal and kg are
// Latin units after a space ("1,000 kcal", "5 kg"). No "당신": the subject is left out.
const number = (value: number) => formatNumber("ko", value);

const UNITS: Record<Unit, string> = {
  calls: "회",
  days: "일",
  foods: "개",
  ideas: "개",
  kcal: " kcal",
  kg: " kg",
  messages: "개",
  minutes: "분",
  steps: "걸음",
  "weigh-ins": "회",
};

const p = (count: number, unit: Unit) => `${number(count)}${UNITS[unit]}`;
const days = (count: number) => p(count, "days");

export const ko: AchievementCopy = {
  count: p,
  locale: "ko",
  notStarted: "시작 전",
  number,
  toGo: (count, unit) => `${unit ? p(count, unit) : number(count)} 남았어요.`,
  unlocked: "획득 완료",

  streak: {
    daysToGo: (count) => `${days(count)} 남음`,
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "오늘 식사를 기록하고 연속 기록을 시작해 보세요.";
      const standing = current === best ? "지금이 최장 연속 기록이에요." : `최장 기록은 ${days(best)} 연속이에요.`;
      return loggedToday ? `${standing} 오늘 기록도 마쳤어요.` : `${standing} 오늘도 식사를 기록해서 연속 기록을 이어 가세요.`;
    },
    next: (title) => `다음 배지: ${title}`,
  },
  streaks: {
    badgeTitle: (count) => `${days(count)} 연속`,
    context: "연속 기록",
    rule: "매일 한 끼 이상 기록해 보세요.",
    tiers: {
      3: { description: "3일 연속으로 매일 한 끼 이상 기록했어요.", name: "3일" },
      7: { description: "꼬박 일주일을 기록했어요. 습관은 여기서 시작돼요.", name: "7일" },
      14: { description: "2주 동안 빠짐없이 기록했어요.", name: "14일" },
      30: { description: "꼬박 한 달을 기록했어요. 이제 습관이 됐어요.", name: "30일" },
      100: { description: "100일 연속이에요. 여기까지 오는 사람은 드물어요.", name: "100일" },
      365: { description: "1년 동안 하루도 빠짐없이 기록했어요.", name: "1년" },
    },
    title: "연속 기록",
    toGo: (count) => `${days(count)} 더 연속으로 식사를 기록해 보세요.`,
  },
  tiers: { 7: "7일", 30: "1개월", 365: "1년" },
  protein: {
    context: "단백질 목표",
    describe: (count) => `${days(count)} 동안 단백질 목표를 달성했어요. 근육도 좋아하고 있어요.`,
    rule: (grams) => (grams ? `하루에 단백질을 ${grams} g 이상 섭취해 보세요.` : "단백질 목표를 정하고 하루 안에 달성해 보세요."),
    title: "단백질 목표",
    toGo: (count, grams) => (grams ? `${days(count)} 더 단백질을 ${grams} g 이상 섭취해 보세요.` : "단백질 목표를 정하면 시작돼요."),
  },
  calories: {
    badgeTitle: "목표 범위",
    context: "칼로리 목표 범위",
    describe: (count) => `${days(count)} 동안 목표의 ±10% 이내였어요. 균형이 좋아요.`,
    rule: (kcal) =>
      kcal
        ? `하루 칼로리를 ${number(kcal)} kcal의 ±10% 이내로 맞춰 보세요.`
        : "칼로리 목표를 정하고 하루 칼로리를 목표의 ±10% 이내로 맞춰 보세요.",
    title: "칼로리 목표 범위",
    toGo: (count, kcal) => (kcal ? `${days(count)} 더 칼로리 목표의 ±10% 이내로 맞춰 보세요.` : "칼로리 목표를 정하면 시작돼요."),
  },
  weight: {
    context: "체중",
    goalDescription: (kg) => `목표 체중 ${kg} kg에 도달했어요.`,
    goalName: "목표",
    goalTitle: (kg) => `목표 체중 · ${kg} kg`,
    rule: (from, to) => (from && to ? `${from} kg에서 ${to} kg까지 가는 길의 이정표예요.` : "목표 체중까지 가는 길의 이정표예요."),
    steps: {
      "gain-1": { description: "처음으로 1 kg 늘었어요. 이대로 계속해요.", title: "첫 1 kg 증가" },
      "gain-5": { description: "시작할 때보다 5 kg 늘었어요.", title: "5 kg 증가" },
      "lose-1": { description: "처음으로 1 kg 줄었어요. 이대로 계속해요.", title: "첫 1 kg 감량" },
      "lose-5": { description: "시작할 때보다 5 kg 줄었어요.", title: "5 kg 감량" },
    },
    title: "체중",
    toGo: (kg) => `${kg} kg 남았어요.`,
  },
  firsts: {
    context: "처음",
    foods: {
      description: "기록만 봐도 취향을 알 수 있어요.",
      name: "음식 100개",
      title: "음식 100개 기록",
      toGo: (count) => `음식을 ${p(count, "foods")} 더 기록해 보세요.`,
    },
    once: {
      "first-barcode": { description: "갖다 대면 기록 끝. 그게 다예요.", name: "바코드", title: "첫 바코드", toGo: "제품 바코드를 스캔해 보세요." },
      "first-group": { description: "함께하면 꾸준히 하기 쉬워요.", name: "그룹", title: "그룹 참여", toGo: "코드나 링크로 그룹에 참여해 보세요." },
      "first-photo": { description: "기록이 벌써 맛있어 보여요.", name: "사진", title: "첫 식사 사진", toGo: "식사에 사진을 추가해 보세요." },
      "first-voice": { description: "타이핑은 필요 없어요.", name: "음성", title: "음성으로 기록", toGo: "입력하는 대신 먹은 음식을 말해 보세요." },
    },
    rule: "기록하고 연결하는 여러 방법을 써 보세요.",
    title: "처음",
    weighIns: {
      description: "중요한 건 한 번의 숫자보다 흐름이에요.",
      name: "체중 기록",
      title: "체중 기록 10회",
      toGo: (count) => `체중을 ${p(count, "weigh-ins")} 더 기록해 보세요.`,
    },
  },
  steps: {
    context: "걸음 수",
    inADay: (amount) => `하루 ${amount}`,
    // `amount` already ends in "걸음" ("10,000걸음"), so no "걸음" after it.
    inOneDay: (amount) => `하루 ${amount} 걷기에 도전해 보세요.`,
    oftenEarned: ["10,000걸음을 넘긴 날이 7일이 됐어요. 습관이 되고 있어요.", "10,000걸음을 넘긴 날이 30일이 됐어요. 튼튼한 다리예요."],
    oftenTitle: "10,000걸음",
    oftenToGo: (count, amount) => `${days(count)} 더 ${amount} 이상 걸어 보세요.`,
    rule: "건강 앱에서 가져온 하루 걸음 수예요.",
    targets: {
      5_000: "많이 걸었어요. 좋은 시작이에요.",
      10_000: "대표적인 목표를 달성했어요.",
      15_000: "대부분의 사람에게 약 11 km예요.",
      20_000: "다리를 좀 쉬게 해 주세요. 정말 수고했어요.",
    },
    title: "걸음 수",
  },
  burned: {
    context: "소모 칼로리",
    inADay: (amount) => `하루 ${amount} 소모`,
    inOneDay: (amount) => `하루에 활동으로 ${amount} 소모해 보세요.`,
    oftenEarned: ["많이 움직인 날이 7일이 됐어요. 몸도 변화를 느끼고 있어요.", "많이 움직인 날이 30일이 됐어요. 대단해요."],
    oftenTitle: "500 kcal 소모",
    oftenToGo: (count, amount) => `${days(count)} 더 ${amount} 이상 소모해 보세요.`,
    rule: "건강 앱에서 가져온, 하루 동안 활동으로 소모한 칼로리예요.",
    targets: {
      300: "제대로 된 운동 한 번 분량이에요.",
      500: "많이 움직였어요. 효과가 나타나고 있어요.",
      750: "활동적인 하루였어요. 수분을 챙기세요.",
      1_000: "대단한 하루예요. 푹 쉬고 잘 챙겨 드세요.",
    },
    title: "소모 칼로리",
  },
  assistant: {
    badges: {
      call: { description: "좋은 대화였어요. 코치는 나눈 이야기를 기억해요.", name: "음성 대화", title: "첫 음성 대화", toGo: () => "코치와 음성으로 대화해 보세요." },
      "calls-5": { description: "말로 하면 더 잘 전해질 때도 있어요.", name: "음성 대화 5회", title: "음성 대화 5회", toGo: (count) => `${p(count, "calls")} 남았어요.` },
      chat: { description: "언제든 무엇이든 물어보세요. 코치는 기록을 알고 있어요.", name: "안녕하세요", title: "첫 메시지", toGo: () => "코치에게 메시지를 보내 보세요." },
      "chats-50": { description: "이제 서로 잘 알게 됐어요.", name: "메시지 50개", title: "메시지 50개", toGo: (count) => `${p(count, "messages")} 남았어요.` },
      idea: { description: "코치의 제안을 실제로 먹었어요.", name: "아이디어", title: "좋은 아이디어", toGo: () => "코치가 제안한 식사를 추가해 보세요." },
      "ideas-10": { description: "음식 취향이 잘 맞나 봐요.", name: "아이디어 10개", title: "아이디어 10개 실천", toGo: (count) => `${p(count, "ideas")} 더 추가해 보세요.` },
      photo: { description: "백문이 불여일견. 메뉴판 사진도 좋아요.", name: "사진", title: "보여 주고 질문하기", toGo: () => "메뉴판 같은 사진을 코치에게 보내 보세요." },
      recipe: { description: "요리할 때는 ‘식단 기록’에서 기다리고 있어요.", name: "레시피", title: "첫 레시피", toGo: () => "코치에게 레시피를 물어보고 저장해 보세요." },
      reply: { description: "‘오늘’에서 탭만 하면 대화가 시작돼요.", name: "답장", title: "대화 다시 시작", toGo: () => "‘오늘’에서 코치의 메시지를 탭해 보세요." },
      voice: { description: "손이 바빠도 타이핑보다 쉬워요.", name: "음성 메시지", title: "첫 음성 메시지", toGo: () => "코치에게 음성 메시지를 보내 보세요." },
    },
    context: "어시스턴트",
    minutes: (minutes) => {
      // 90 minutes is "1.5시간".
      const span = minutes < 60 ? p(minutes, "minutes") : `${number(minutes / 60)}시간`;
      return {
        description: minutes < 60 ? "코치와 좋은 시작이에요." : minutes < 300 ? "알찬 시간이었어요." : "이제 오랜 친구 같아요.",
        name: span,
        title: `함께한 ${span}`,
        toGo: (count) => `코치와 ${p(Math.ceil(count), "minutes")} 더 대화해 보세요.`,
      };
    },
    rule: "글로 쓰고, 말하고, 보여 주고, 요리하면서 코치와 친해져 보세요.",
    title: "어시스턴트",
  },
};
