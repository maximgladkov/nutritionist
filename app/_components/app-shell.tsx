"use client";

import { ArrowRightFromSquare, ChartColumn, Comment, Gear, Plus } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { AppLayout, Navbar, Sidebar } from "@heroui-pro/react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
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
  const pathname = usePathname();
  const router = useRouter();
  const isChat = pathname === "/" || pathname === "/s" || pathname.startsWith("/s/");
  const isSettings = pathname.startsWith("/settings");
  const isSummary = pathname.startsWith("/summary");
  const title = isSettings ? "Settings" : isSummary ? "Summary" : "Chat";

  if (pathname === "/login" || embed) {
    return children;
  }

  return (
    <AppLayout
      className="h-dvh"
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
                aria-label="Start a new chat"
                size="sm"
                variant="ghost"
                onPress={() => router.push("/s")}
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">New chat</span>
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
      <div className="flex h-full min-h-0 flex-col">{children}</div>
    </AppLayout>
  );
}

function SidebarBrand() {
  return (
    <Sidebar.Header>
      <div className="flex items-center gap-3 px-1 py-2">
        <div className="bg-accent flex size-6 shrink-0 items-center justify-center rounded-md">
          <span className="text-accent-foreground text-sm font-bold">N</span>
        </div>
        <span className="text-foreground text-sm font-semibold" data-sidebar="label">
          Nutritionist
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
  return (
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.Menu aria-label="Navigation">
          <Sidebar.MenuItem href="/s" id="chat" isCurrent={isChat} textValue="Chat">
            <Sidebar.MenuIcon>
              <Comment className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>Chat</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem href="/summary" id="summary" isCurrent={isSummary} textValue="Summary">
            <Sidebar.MenuIcon>
              <ChartColumn className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>Summary</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem
            href="/settings"
            id="settings"
            isCurrent={isSettings}
            textValue="Settings"
          >
            <Sidebar.MenuIcon>
              <Gear className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>Settings</Sidebar.MenuLabel>
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
          <span data-sidebar="label">Sign out</span>
        </Button>
      </form>
    </Sidebar.Footer>
  );
}
