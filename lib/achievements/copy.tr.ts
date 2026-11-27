import { formatNumber } from "../i18n/locales.ts";
import type { AchievementCopy, Unit } from "./copy.ts";

// Türkiye Turkish, informal "sen", like the app. Quotes are “ ”; no space before ":", "!" and "?".
// Nothing inserted takes a suffix (it would follow the value's last vowel, which we don't know): the
// suffix goes on a fixed word after it ("7 günlük seri"), or the line is a label ("Sıradaki rozet: …").
// A noun after a number stays singular ("1 gün", "5 gün"), so each unit has one form. "Left" lines end
// in "kaldı" or "daha", which don't change with the number.
const number = (value: number) => formatNumber("tr", value);

const UNITS: Record<Unit, string> = {
  calls: "sesli sohbet",
  days: "gün",
  foods: "yiyecek",
  ideas: "öneri",
  kcal: "kcal",
  kg: "kg",
  messages: "mesaj",
  minutes: "dakika",
  steps: "adım",
  "weigh-ins": "tartım",
};

const p = (count: number, unit: Unit) => `${number(count)} ${UNITS[unit]}`;
const days = (count: number) => p(count, "days");

export const tr: AchievementCopy = {
  count: p,
  locale: "tr",
  notStarted: "Henüz başlamadın",
  number,
  toGo: (count, unit) => `${unit ? p(count, unit) : number(count)} kaldı.`,
  unlocked: "Kazanıldı",

  streak: {
    daysToGo: (count) => `${days(count)} kaldı`,
    message: ({ best, days: current, loggedToday }) => {
      if (current === 0) return "Seri başlatmak için bugün bir öğün ekle.";
      const standing = current === best ? "Şimdiye kadarki en iyi serin." : `En iyi serin: ${days(best)}.`;
      return loggedToday ? `${standing} Bugün de kaydettin.` : `${standing} Bozulmasın diye bugün bir öğün ekle.`;
    },
    next: (title) => `Sıradaki rozet: ${title}`,
  },
  streaks: {
    // "7 günlük seri": the suffix is on "gün", not on the number.
    badgeTitle: (count) => `${number(count)} günlük seri`,
    context: "Gün serisi",
    rule: "Her gün en az bir öğün ekle.",
    tiers: {
      3: { description: "Üç gün üst üste, her gün en az bir öğün eklendi.", name: "3 gün" },
      7: { description: "Tam bir hafta kayıt. Alışkanlıklar böyle başlar.", name: "7 gün" },
      14: { description: "İki hafta boyunca aralıksız kayıt.", name: "14 gün" },
      30: { description: "Koca bir ay kayıt. Artık bu bir alışkanlık.", name: "30 gün" },
      100: { description: "Yüz gün üst üste. Buraya çok az kişi ulaşıyor.", name: "100 gün" },
      365: { description: "Bir yıl boyunca her gün kayıt.", name: "1 yıl" },
    },
    title: "Seriler",
    toGo: (count) => `Üst üste ${days(count)} daha öğün ekle.`,
  },
  tiers: { 7: "7 gün", 30: "1 ay", 365: "1 yıl" },
  protein: {
    context: "Protein hedefi",
    describe: (count) => `Kasların bunu fark etti. Gurur duyabileceğin ${days(count)}.`,
    rule: (grams) => (grams ? `Bir günde en az ${grams} g protein al.` : "Bir protein hedefi belirle ve bir günde ona ulaş."),
    title: "Protein hedefi",
    toGo: (count, grams) => (grams ? `En az ${grams} g proteinle ${days(count)} daha.` : "Başlamak için bir protein hedefi belirle."),
  },
  calories: {
    badgeTitle: "Hedefte",
    context: "Kalori hedefte",
    describe: (count) => `Hedefine %10 yakınlıkta ${days(count)}. İşte denge bu.`,
    rule: (kcal) =>
      kcal ? `Gün boyunca ${number(kcal)} kcal hedefinin %10 yakınında kal.` : "Bir kalori hedefi belirle ve gün boyunca onun %10 yakınında kal.",
    title: "Kalori hedefte",
    toGo: (count, kcal) => (kcal ? `Kalori hedefinin %10 yakınında ${days(count)} daha.` : "Başlamak için bir kalori hedefi belirle."),
  },
  weight: {
    context: "Kilo",
    goalDescription: (kg) => `Hedefine ulaştın: ${kg} kg.`,
    goalName: "Hedef",
    goalTitle: (kg) => `Hedef kilo · ${kg} kg`,
    // A label, so "kg" needn't take "-dan" / "-a".
    rule: (from, to) => (from && to ? `Yoldaki kilometre taşları: ${from} kg → ${to} kg.` : "Hedef kilona giden yoldaki kilometre taşları."),
    steps: {
      "gain-1": { description: "İlk kilonu aldın. Devam et.", title: "İlk kilo alındı" },
      "gain-5": { description: "Başladığın yerden beş kilo daha ağırsın.", title: "Beş kilo alındı" },
      "lose-1": { description: "İlk kilonu verdin. Devam et.", title: "İlk kilo verildi" },
      "lose-5": { description: "Başladığın yerden beş kilo daha hafifsin.", title: "Beş kilo verildi" },
    },
    title: "Kilo",
    toGo: (kg) => `${kg} kg kaldı.`,
  },
  firsts: {
    context: "İlk kez",
    foods: {
      description: "Günlüğün artık seni tanıyor.",
      name: "100 yiyecek",
      title: "100 yiyecek eklendi",
      toGo: (count) => `${p(count, "foods")} daha ekle.`,
    },
    once: {
      "first-barcode": { description: "Doğrult, bip, eklendi. Bu kadar.", name: "Barkod", title: "İlk barkod taraması", toGo: "Bir ürünün barkodunu tara." },
      "first-group": { description: "Birlikte daha kolay.", name: "Grup", title: "Gruba katıldın", toGo: "Kodla ya da bağlantıyla bir gruba katıl." },
      "first-photo": { description: "Günlüğün şimdiden daha lezzetli görünüyor.", name: "Fotoğraf", title: "İlk öğün fotoğrafı", toGo: "Bir öğüne fotoğraf ekle." },
      "first-voice": { description: "Yazmaya gerek yok.", name: "Ses", title: "Sesle anlat", toGo: "Ne yediğini yazmak yerine söyle." },
    },
    rule: "Kayıt tutmanın ve bağlantı kurmanın her yolunu dene.",
    title: "İlkler",
    weighIns: {
      description: "Gidişat, tek bir sayıdan daha önemli.",
      name: "Tartımlar",
      title: "10 tartım",
      toGo: (count) => `${p(count, "weigh-ins")} daha kaydet.`,
    },
  },
  steps: {
    context: "Adım",
    inADay: (amount) => `Bir günde ${amount}`,
    inOneDay: (amount) => `Bir günde ${amount} at.`,
    oftenEarned: ["Yedi gün 10.000 adımın üzerinde. Alışkanlık oluyor.", "Otuz gün 10.000 adımın üzerinde. Güçlü bacaklar."],
    oftenTitle: "10.000 adım",
    oftenToGo: (count, amount) => `En az ${amount} attığın ${days(count)} daha.`,
    rule: "Gün içinde attığın adımlar, Apple Health’ten.",
    targets: {
      5_000: "Güzel bir yürüyüş. Başlamak için harika.",
      10_000: "Klasik hedef ve başardın.",
      15_000: "Çoğu kişi için yaklaşık on bir kilometre.",
      20_000: "Ayaklarını uzat. Bunu hak ettin.",
    },
    title: "Adım",
  },
  burned: {
    context: "Yakılan kalori",
    // "yakıldı" is passive, so it reads right for any amount.
    inADay: (amount) => `Bir günde ${amount} yakıldı`,
    inOneDay: (amount) => `Bir günde hareket ederek ${amount} yak.`,
    oftenEarned: ["Yedi aktif gün. Vücudun bunu fark ediyor.", "Otuz aktif gün. Etkileyici."],
    oftenTitle: "500 kcal yakıldı",
    oftenToGo: (count, amount) => `En az ${amount} yaktığın ${days(count)} daha.`,
    rule: "Gün içinde hareket ederek yaktığın kaloriler, Apple Health’ten.",
    targets: {
      300: "Sağlam bir antrenman kadar.",
      500: "Gerçekten hareket ettin. Belli oluyor.",
      750: "Büyük bir gün. Biraz su iç.",
      1_000: "Dev bir gün. İyi dinlen ve düzgün beslen.",
    },
    title: "Yakılan kalori",
  },
  assistant: {
    badges: {
      call: { description: "Güzel bir sohbet. Koçun söylediklerini hatırlıyor.", name: "Sesli sohbet", title: "İlk sesli sohbet", toGo: () => "Koçunla sesli sohbet et." },
      "calls-5": { description: "Bazı şeyler sesli söylenince daha iyi.", name: "5 sesli sohbet", title: "5 sesli sohbet", toGo: (count) => `${p(count, "calls")} daha.` },
      chat: { description: "İstediğini, istediğin zaman sor. Koçun günlüğünü biliyor.", name: "Merhaba", title: "İlk mesaj", toGo: () => "Koçuna yaz." },
      "chats-50": { description: "Artık birbirinizi iyi tanıyorsunuz.", name: "50 mesaj", title: "50 mesaj", toGo: (count) => `${p(count, "messages")} daha.` },
      idea: { description: "Koçun önerdi, sen yedin.", name: "Öneri", title: "İyi fikir", toGo: () => "Koçunun önerdiği bir öğünü ekle." },
      "ideas-10": { description: "Belli ki zevkleriniz aynı.", name: "10 öneri", title: "Yenen 10 öneri", toGo: (count) => `${p(count, "ideas")} daha ekle.` },
      photo: { description: "Bir fotoğraf bin kelimeye bedel. Menüler de olur.", name: "Fotoğraf", title: "Göster ve sor", toGo: () => "Koçuna bir fotoğraf gönder, örneğin bir menü." },
      recipe: { description: "Yemek yaparken “Yemek ekle” ekranında seni bekliyor.", name: "Tarif", title: "İlk tarif", toGo: () => "Koçundan bir tarif iste ve kaydet." },
      reply: { description: "“Bugün” ekranında tek dokunuş ve sohbet başladı.", name: "Yanıt", title: "Sohbete katıldın", toGo: () => "“Bugün” ekranında koçunun mesajına dokun." },
      voice: { description: "Ellerin doluyken yazmaktan kolay.", name: "Sesli mesaj", title: "İlk sesli mesaj", toGo: () => "Koçuna sesli mesaj gönder." },
    },
    context: "Asistan",
    minutes: (minutes) => {
      // 90 minutes is "1,5 saat"; "saat" stays as it is after any number.
      const span = minutes < 60 ? `${minutes} dk` : `${number(minutes / 60)} saat`;
      return {
        description: minutes < 60 ? "Sen ve koçun için iyi bir başlangıç." : minutes < 300 ? "İyi geçirilmiş zaman." : "Neredeyse eski dostsunuz.",
        name: span,
        title: `Birlikte ${minutes < 60 ? p(minutes, "minutes") : span}`,
        toGo: (count) => `Koçunla ${p(Math.ceil(count), "minutes")} daha.`,
      };
    },
    rule: "Koçunu tanı: yaz, konuş, göster ve yemek yap.",
    title: "Asistan",
  },
};
