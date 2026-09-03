"use client";

import { ArrowRightFromSquare, ChartColumn, Comment, Gear, Plus } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { AppLayout, Navbar, Sidebar } from "@heroui-pro/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "@/app/_components/brand-mark";
import { DesktopWorkspace, useDesktopLayout } from "@/app/_components/desktop-workspace";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { MiniAppShell } from "@/app/_components/mini-app-shell";
import { signOutAction } from "@/app/actions/auth";

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
  const isSettings = pathname.startsWith("/settings");
  const isSummary = pathname.startsWith("/summary");
  const title = isSettings ? t`Settings` : isSummary ? t`Summary` : t`Chat`;

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
    <AppLayout
      className="h-dvh"
      key={locale}
      navigate={router.push}
      navbar={
        <Navbar maxWidth="full">
          <Navbar.Header>
            <AppLayout.MenuToggle />
            <Sidebar.Trigger />
            <span className="text-foreground truncate text-sm font-semibold">{title}</span>
            <Navbar.Spacer />
            {isChat ? (
              <Button
                aria-label={t`Start a new chat`}
                size="sm"
                variant="ghost"
                onPress={() => router.push("/s")}
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">
                  <Trans>New chat</Trans>
                </span>
              </Button>
            ) : null}
          </Navbar.Header>
        </Navbar>
      }
      scrollMode="content"
      sidebar={
        <>
          <Sidebar>
            <SidebarBrand />
            <SidebarNav isChat={isChat} isSettings={isSettings} isSummary={isSummary} />
            <SidebarAccount email={email} />
            <Sidebar.Rail />
          </Sidebar>
          <Sidebar.Mobile>
            <SidebarBrand />
            <SidebarNav isChat={isChat} isSettings={isSettings} isSummary={isSummary} />
            <SidebarAccount email={email} />
          </Sidebar.Mobile>
        </>
      }
      sidebarCollapsible="icon"
    >
      {isChat ? <div className="flex h-full min-h-0 flex-col">{children}</div> : children}
    </AppLayout>
  );
}

function SidebarBrand() {
  return (
    <Sidebar.Header>
      <div className="flex items-center gap-3 px-1 py-2">
        <BrandMark />
        <span className="text-foreground text-sm font-semibold" data-sidebar="label">
          <Trans>BTR.me</Trans>
        </span>
      </div>
    </Sidebar.Header>
  );
}

function SidebarNav({
  isChat,
  isSettings,
  isSummary,
}: {
  readonly isChat: boolean;
  readonly isSettings: boolean;
  readonly isSummary: boolean;
}) {
  const { t } = useLingui();
  const chat = t`Chat`;
  const summary = t`Summary`;
  const settings = t`Settings`;
  return (
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.Menu aria-label={t`Navigation`}>
          <Sidebar.MenuItem href="/s" id="chat" isCurrent={isChat} textValue={chat}>
            <Sidebar.MenuIcon>
              <Comment className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{chat}</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem href="/summary" id="summary" isCurrent={isSummary} textValue={summary}>
            <Sidebar.MenuIcon>
              <ChartColumn className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{summary}</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem
            href="/settings"
            id="settings"
            isCurrent={isSettings}
            textValue={settings}
          >
            <Sidebar.MenuIcon>
              <Gear className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{settings}</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Group>
    </Sidebar.Content>
  );
}

function SidebarAccount({ email }: { readonly email?: string }) {
  return (
    <Sidebar.Footer>
      {email ? (
        <p className="text-muted truncate px-2 pb-2 text-xs" data-sidebar="label">
          {email}
        </p>
      ) : null}
      <form action={signOutAction}>
        <Button className="w-full justify-start" type="submit" variant="ghost">
          <ArrowRightFromSquare className="size-4" />
          <span data-sidebar="label">
            <Trans>Sign out</Trans>
          </span>
        </Button>
      </form>
    </Sidebar.Footer>
  );
}
