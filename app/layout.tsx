import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { auth } from "@/auth";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nutritionist",
  description: "A nutritionist agent with web, Telegram, and WhatsApp chat.",
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const session = await auth();
  const embed = (await headers()).get("x-tg-embed") === "1";
  return (
    <html className={cn(sans.variable, mono.variable)} lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <AppShell email={session?.user?.email ?? undefined} embed={embed}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
