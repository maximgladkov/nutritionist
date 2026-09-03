import { t } from "@lingui/core/macro";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NutritionSummaryApp } from "@/app/_components/nutrition-summary";
import { auth } from "@/auth";
import { getI18nInstance } from "@/lib/i18n/app-router-i18n";
import { initLingui } from "@/lib/i18n/init-lingui";
import { resolveRequestLocale } from "@/lib/i18n/request-locale";
import { loadNutritionDiary } from "@/lib/summary";

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const locale = await resolveRequestLocale(session?.user?.id);
  const i18n = getI18nInstance(locale);
  return { title: t(i18n)`Summary` };
}

export default async function SummaryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly embed?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const locale = await resolveRequestLocale(session?.user?.id);
  initLingui(locale);
  if (params.embed === "tg") {
    return <NutritionSummaryApp embed />;
  }
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/summary");
  }
  const initial = await loadNutritionDiary({ userId: session.user.id });
  return <NutritionSummaryApp embed={false} initial={initial} />;
}

