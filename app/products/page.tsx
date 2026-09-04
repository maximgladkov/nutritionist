import { t } from "@lingui/core/macro";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProductsApp } from "@/app/_components/products-app";
import { auth } from "@/auth";
import { getI18nInstance } from "@/lib/i18n/app-router-i18n";
import { initLingui } from "@/lib/i18n/init-lingui";
import { resolveRequestLocale } from "@/lib/i18n/request-locale";

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const locale = await resolveRequestLocale(session?.user?.id);
  const i18n = getI18nInstance(locale);
  return { title: t(i18n)`Products` };
}

export default async function ProductsPage() {
  const session = await auth();
  const locale = await resolveRequestLocale(session?.user?.id);
  initLingui(locale);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/products");
  }
  return <ProductsApp embed={false} />;
}
