import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NutritionSummaryApp } from "@/app/_components/nutrition-summary";
import { auth } from "@/auth";
import { loadNutritionDiary } from "@/lib/summary";

export const metadata: Metadata = {
  title: "Summary",
};

export default async function SummaryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly embed?: string }>;
}) {
  const params = await searchParams;
  if (params.embed === "tg") {
    return <NutritionSummaryApp embed />;
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/summary");
  }
  const initial = await loadNutritionDiary({ userId: session.user.id });
  return <NutritionSummaryApp embed={false} initial={initial} />;
}
