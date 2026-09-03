"use client";

import { Plus } from "@gravity-ui/icons";
import { Button, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DesktopWorkspace, useDesktopLayout } from "@/app/_components/desktop-workspace";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { MiniAppShell } from "@/app/_components/mini-app-shell";
import { WebAppTabBar, type WebAppTab } from "@/app/_components/mini-app-tab-bar";

export function AppShell({
  children,
  email,
  embed = false,
}: {
  readonly children: ReactNode;
  readonly email?: string;
  readonly embed?: boolean;
}) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  const pathname = usePathname();
  const router = useRouter();
  const isDesktop = useDesktopLayout();
  const isChat = pathname === "/" || pathname === "/s" || pathname.startsWith("/s/");
  const selected = tabFromPath(pathname);

  if (pathname === "/login") {
    return children;
  }

  if (embed) {
    return <MiniAppShell>{children}</MiniAppShell>;
  }

  if (isDesktop === null) {
    return <div className="bg-background h-dvh" />;
  }

  if (isDesktop) {
    return <DesktopWorkspace email={email} key={locale} />;
  }

  return (
    <div className="relative h-dvh overflow-hidden" key={locale}>
      <div
        className={
          isChat
            ? "flex h-full min-h-0 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
            : "h-full overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
        }
      >
        {isChat && pathname.startsWith("/s/") ? (
          <div className="absolute top-3 right-3 z-20">
            <Tooltip delay={0}>
              <Button
                aria-label={t`Start a new chat`}
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => router.push("/s")}
              >
                <Plus className="size-4" />
              </Button>
              <Tooltip.Content>
                <Trans>New chat</Trans>
              </Tooltip.Content>
            </Tooltip>
          </div>
        ) : null}
        {isChat ? <div className="flex h-full min-h-0 flex-col">{children}</div> : children}
      </div>
      <WebAppTabBar
        selected={selected}
        onSelect={(tab) => {
          const href = hrefForTab(tab, pathname);
          if (href !== pathname) {
            router.push(href);
          }
        }}
      />
    </div>
  );
}

function tabFromPath(pathname: string): WebAppTab {
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  if (pathname.startsWith("/summary")) {
    return "summary";
  }
  return "chat";
}

function hrefForTab(tab: WebAppTab, pathname: string): string {
  if (tab === "settings") {
    return "/settings";
  }
  if (tab === "summary") {
    return "/summary";
  }
  if (pathname === "/" || pathname === "/s" || pathname.startsWith("/s/")) {
    return pathname;
  }
  return "/s";
}
