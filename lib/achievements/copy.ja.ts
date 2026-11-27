import { formatNumber } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Japan Japanese, polite です/ます in sentences, short nouns on labels. Quotes are 「」; full-width "：" and "！".
// No plurals: a number takes its counter straight after it ("7日", "10,000歩"), while kcal and kg are
// Latin units after a space ("1,000 kcal", "5 kg"). No "あなた": the subject is left out.
const number = (value: number) => formatNumber("ja", value);

const UNITS: Record<Unit, string> = {
  calls: "回",
  days: "日",
  foods: "品",
  ideas: "件",
  kcal: " kcal",
  kg: " kg",
  messages: "件",
  minutes: "分",
  steps: "歩",
  "weigh-ins": "回",
};

const p = (count: number, unit: Unit) => `${number(count)}${UNITS[unit]}`;
const days = (count: number) => p(count, "days");

export const ja: AchievementCopy = {
  count: p,
  locale: "ja",
  notStarted: "未開始",
  number,
  toGo: (count, unit) => `あと${unit ? p(count, unit) : number(count)}です。`,
  unlocked: "獲得済み",

  streak: {
    daysToGo: (count) => `あと${days(count)}`,
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "今日食事を記録して、連続記録を始めましょう。";
      const standing = current === best ? "これまでで最長の連続記録です。" : `最長記録は${days(best)}です。`;
      return loggedToday ? `${standing}今日の記録も済んでいます。` : `${standing}今日も食事を記録して、記録を続けましょう。`;
    },
    next: (title) => `次のバッジ：${title}`,
  },
  streaks: {
    badgeTitle: (count) => `${days(count)}連続`,
    context: "連続記録",
    rule: "毎日1食以上記録しましょう。",
    tiers: {
      3: { description: "3日連続で、毎日1食以上記録しました。", name: "3日" },
      7: { description: "丸1週間の記録です。習慣はここから始まります。", name: "7日" },
      14: { description: "2週間、途切れずに記録しました。", name: "14日" },
      30: { description: "丸1か月の記録です。もう習慣になっています。", name: "30日" },
      100: { description: "100日連続です。ここまで来る人はわずかです。", name: "100日" },
      365: { description: "1年間、毎日欠かさず記録しました。", name: "1年" },
    },
    title: "連続記録",
    toGo: (count) => `あと${days(count)}連続で食事を記録しましょう。`,
  },
  tiers: { 7: "7日", 30: "1か月", 365: "1年" },
  protein: {
    context: "たんぱく質の目標",
    describe: (count) => `たんぱく質の目標を${days(count)}達成しました。筋肉も喜んでいます。`,
    rule: (grams) => (grams ? `1日に${grams} g以上のたんぱく質をとりましょう。` : "たんぱく質の目標を設定して、1日で達成しましょう。"),
    title: "たんぱく質の目標",
    toGo: (count, grams) => (grams ? `あと${days(count)}、たんぱく質を${grams} g以上とりましょう。` : "たんぱく質の目標を設定すると始まります。"),
  },
  calories: {
    badgeTitle: "目標どおり",
    context: "カロリー目標どおり",
    describe: (count) => `${days(count)}、目標の±10%以内でした。いいバランスです。`,
    rule: (kcal) =>
      kcal
        ? `1日のカロリーを${number(kcal)} kcalの±10%以内に収めましょう。`
        : "カロリー目標を設定して、1日のカロリーをその±10%以内に収めましょう。",
    title: "カロリー目標どおり",
    toGo: (count, kcal) => (kcal ? `あと${days(count)}、カロリー目標の±10%以内に収めましょう。` : "カロリー目標を設定すると始まります。"),
  },
  weight: {
    context: "体重",
    goalDescription: (kg) => `目標体重の${kg} kgに到達しました。`,
    goalName: "目標",
    goalTitle: (kg) => `目標体重 · ${kg} kg`,
    rule: (from, to) => (from && to ? `${from} kgから${to} kgまでの道のりの節目です。` : "目標体重までの道のりの節目です。"),
    steps: {
      "gain-1": { description: "最初の1 kgが増えました。この調子です。", title: "最初の1 kg増" },
      "gain-5": { description: "スタート時より5 kg増えました。", title: "5 kg増" },
      "lose-1": { description: "最初の1 kgが減りました。この調子です。", title: "最初の1 kg減" },
      "lose-5": { description: "スタート時より5 kg減りました。", title: "5 kg減" },
    },
    title: "体重",
    toGo: (kg) => `あと${kg} kgです。`,
  },
  firsts: {
    context: "初めて",
    foods: {
      description: "記録を見れば、もう好みがわかります。",
      name: "100品",
      title: "100品を記録",
      toGo: (count) => `あと${p(count, "foods")}記録しましょう。`,
    },
    once: {
      "first-barcode": { description: "かざして、ピッで記録完了。それだけです。", name: "バーコード", title: "初めてのバーコード", toGo: "商品のバーコードをスキャンしましょう。" },
      "first-group": { description: "一緒だと続けやすくなります。", name: "グループ", title: "グループに参加", toGo: "コードかリンクでグループに参加しましょう。" },
      "first-photo": { description: "記録がもうおいしそうです。", name: "写真", title: "初めての食事写真", toGo: "食事に写真を追加しましょう。" },
      "first-voice": { description: "入力は要りません。", name: "音声", title: "音声で記録", toGo: "入力する代わりに、食べたものを話しましょう。" },
    },
    rule: "記録やつながりのいろいろな方法を試しましょう。",
    title: "初めて",
    weighIns: {
      description: "大切なのは1回の数字より傾向です。",
      name: "体重記録",
      title: "体重記録10回",
      toGo: (count) => `あと${p(count, "weigh-ins")}体重を記録しましょう。`,
    },
  },
  steps: {
    context: "歩数",
    inADay: (amount) => `1日${amount}`,
    // `amount` already ends in "歩", so no "歩きましょう" after it.
    inOneDay: (amount) => `1日で${amount}を目指しましょう。`,
    oftenEarned: ["10,000歩を超えた日が7日になりました。習慣になってきています。", "10,000歩を超えた日が30日になりました。たくましい脚です。"],
    oftenTitle: "10,000歩",
    oftenToGo: (count, amount) => `あと${days(count)}、${amount}以上を目指しましょう。`,
    rule: "ヘルスケアから取得した1日の歩数です。",
    targets: {
      5_000: "しっかり歩きました。いいスタートです。",
      10_000: "定番の目標を達成しました。",
      15_000: "多くの人にとって約11 kmです。",
      20_000: "脚を休めましょう。よく頑張りました。",
    },
    title: "歩数",
  },
  burned: {
    context: "消費カロリー",
    inADay: (amount) => `1日に${amount}消費`,
    inOneDay: (amount) => `1日に体を動かして${amount}消費しましょう。`,
    oftenEarned: ["よく動いた日が7日になりました。体も変化に気づいています。", "よく動いた日が30日になりました。すばらしいです。"],
    oftenTitle: "500 kcal消費",
    oftenToGo: (count, amount) => `あと${days(count)}、${amount}以上消費しましょう。`,
    rule: "ヘルスケアから取得した、1日に体を動かして消費したカロリーです。",
    targets: {
      300: "しっかりしたワークアウト1回分です。",
      500: "よく動きました。成果が出ています。",
      750: "よく動いた1日です。水分をとりましょう。",
      1_000: "すごい1日です。よく休んで、しっかり食べましょう。",
    },
    title: "消費カロリー",
  },
  assistant: {
    badges: {
      call: { description: "いい会話でした。コーチは話した内容を覚えています。", name: "音声会話", title: "初めての音声会話", toGo: () => "コーチと音声で話しましょう。" },
      "calls-5": { description: "声に出したほうが伝わることもあります。", name: "音声会話5回", title: "音声会話5回", toGo: (count) => `あと${p(count, "calls")}です。` },
      chat: { description: "いつでも何でも聞けます。コーチは記録を知っています。", name: "こんにちは", title: "初めてのメッセージ", toGo: () => "コーチにメッセージを送りましょう。" },
      "chats-50": { description: "もうお互いをよく知っています。", name: "メッセージ50件", title: "メッセージ50件", toGo: (count) => `あと${p(count, "messages")}です。` },
      idea: { description: "コーチの提案を、実際に食べました。", name: "アイデア", title: "いいアイデア", toGo: () => "コーチが提案した食事を追加しましょう。" },
      "ideas-10": { description: "食の好みが合うようです。", name: "アイデア10件", title: "アイデア10件を実食", toGo: (count) => `あと${p(count, "ideas")}追加しましょう。` },
      photo: { description: "百聞は一見にしかず。メニューの写真もOKです。", name: "写真", title: "見せて質問", toGo: () => "メニューなどの写真をコーチに送りましょう。" },
      recipe: { description: "料理するときは「食事を記録」で待っています。", name: "レシピ", title: "初めてのレシピ", toGo: () => "コーチにレシピを聞いて保存しましょう。" },
      reply: { description: "「今日」でタップするだけで会話が始まります。", name: "返信", title: "会話を再開", toGo: () => "「今日」でコーチのメッセージをタップしましょう。" },
      voice: { description: "手がふさがっていても、入力より簡単です。", name: "音声メッセージ", title: "初めての音声メッセージ", toGo: () => "コーチに音声メッセージを送りましょう。" },
    },
    context: "アシスタント",
    minutes: (minutes) => {
      // 90 minutes is "1.5時間".
      const span = minutes < 60 ? p(minutes, "minutes") : `${number(minutes / 60)}時間`;
      return {
        description: minutes < 60 ? "コーチとのいいスタートです。" : minutes < 300 ? "有意義な時間でした。" : "もう旧友のようです。",
        name: span,
        title: `一緒に${span}`,
        toGo: (count) => `コーチとあと${p(Math.ceil(count), "minutes")}話しましょう。`,
      };
    },
    rule: "書いたり、話したり、見せたり、料理したりして、コーチと仲良くなりましょう。",
    title: "アシスタント",
  },
};
