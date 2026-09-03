import { t } from "@lingui/core/macro";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { LinguiClientProvider } from "@/app/_components/lingui-client-provider";
import { ToastHost } from "@/app/_components/toast-host";
import { auth } from "@/auth";
import { getI18nInstance } from "@/lib/i18n/app-router-i18n";
import { getDirection } from "@/lib/i18n/locales";
import { initLingui } from "@/lib/i18n/init-lingui";
import { resolveRequestLocale } from "@/lib/i18n/request-locale";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["cyrillic", "latin"],
  weight: "variable",
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
};

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const locale = await resolveRequestLocale(session?.user?.id);
  const i18n = getI18nInstance(locale);
  return {
    title: t(i18n)`Nutritionist`,
    description: t(i18n)`A nutritionist agent with web, Telegram, and WhatsApp chat.`,
  };
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const session = await auth();
  const locale = await resolveRequestLocale(session?.user?.id);
  initLingui(locale);
  const embed = (await headers()).get("x-tg-embed") === "1";
  return (
    <html
      className={cn(sans.variable, mono.variable)}
      dir={getDirection(locale)}
      lang={locale}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground antialiased">
        <LinguiClientProvider initialLocale={locale}>
          <ToastHost />
          <AppShell email={session?.user?.email ?? undefined} embed={embed}>
            {children}
          </AppShell>
        </LinguiClientProvider>
      </body>
    </html>
  );
}
