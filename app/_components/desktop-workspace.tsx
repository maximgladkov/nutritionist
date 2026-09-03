"use client";

import { AgentChat } from "@/app/_components/agent-chat";
import { DesktopSettings } from "@/app/_components/desktop-settings";
import {
  DesktopWorkspaceContext,
  type DesktopWidgetId,
} from "@/app/_components/desktop-workspace-context";
import { NutritionSummaryApp } from "@/app/_components/nutrition-summary";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { ArrowRightFromSquare } from "@gravity-ui/icons";
import { Widget } from "@heroui-pro/react";
import { Button, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useMemo, useState } from "react";

const DESKTOP_MQ = "(min-width: 1024px)";
const WIDGET_FRAME =
  "shadow-overlay ring-foreground/8 h-[min(44rem,70dvh)] w-[min(25rem,100vw)] shrink-0 ring-1";

export function useDesktopLayout() {
  const [matches, setMatches] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const media = window.matchMedia(DESKTOP_MQ);
    const sync = () => {
      setMatches(media.matches);
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  return matches;
}

export function DesktopWorkspace({ email }: { readonly email?: string }) {
  const { t } = useLingui();
  const pathname = usePathname();
  const [front, setFront] = useState<DesktopWidgetId>("chat");
  const chat = chatSessionFromPath(pathname);
  const api = useMemo(
    () => ({
      focusWidget: setFront,
    }),
    [],
  );

  return (
    <DesktopWorkspaceContext.Provider value={api}>
      <div className="bg-background relative h-dvh overflow-x-auto">
        <div className="absolute top-4 right-6 z-20 flex max-w-[min(24rem,calc(100%-2rem))] items-center gap-3">
          {email ? <p className="text-muted min-w-0 truncate text-sm">{email}</p> : null}
          <form action={signOutAction}>
            <Tooltip delay={0}>
              <Button aria-label={t`Sign out`} isIconOnly size="sm" type="submit" variant="ghost">
                <ArrowRightFromSquare className="size-4" />
              </Button>
              <Tooltip.Content>
                <Trans>Sign out</Trans>
              </Tooltip.Content>
            </Tooltip>
          </form>
        </div>
        <div className="flex h-full items-center justify-around gap-2 px-8">
          <Widget
            aria-label={t`Chat`}
            className={cn(WIDGET_FRAME, "-rotate-1 -translate-y-6", front === "chat" && "z-10")}
            onPointerDown={() => setFront("chat")}
          >
            <Widget.Header>
              <Widget.Title>
                <Trans>Chat</Trans>
              </Widget.Title>
            </Widget.Header>
            <Widget.Content className="flex min-h-0 flex-col p-0">
              <AgentChat
                compact
                key={chat.sessionId ?? (chat.sessionless ? "new" : "home")}
                sessionId={chat.sessionId}
                sessionless={chat.sessionless}
              />
            </Widget.Content>
          </Widget>
          <Widget
            aria-label={t`Summary`}
            className={cn(WIDGET_FRAME, "translate-y-8", front === "summary" && "z-10")}
            onPointerDown={() => setFront("summary")}
          >
            <Widget.Header>
              <Widget.Title>
                <Trans>Summary</Trans>
              </Widget.Title>
            </Widget.Header>
            <Widget.Content className="min-h-0 p-0">
              <NutritionSummaryApp compact embed={false} />
            </Widget.Content>
          </Widget>
          <Widget
            aria-label={t`Settings`}
            className={cn(WIDGET_FRAME, "rotate-1 -translate-y-2", front === "settings" && "z-10")}
            onPointerDown={() => setFront("settings")}
          >
            <Widget.Header>
              <Widget.Title>
                <Trans>Settings</Trans>
              </Widget.Title>
            </Widget.Header>
            <Widget.Content className="min-h-0 p-0">
              <DesktopSettings />
            </Widget.Content>
          </Widget>
        </div>
      </div>
    </DesktopWorkspaceContext.Provider>
  );
}

function chatSessionFromPath(pathname: string): {
  readonly sessionId?: string;
  readonly sessionless: boolean;
} {
  if (pathname === "/s") {
    return { sessionless: true };
  }
  if (pathname.startsWith("/s/")) {
    const id = decodeURIComponent(pathname.slice(3).split("/")[0] ?? "");
    return id ? { sessionId: id, sessionless: false } : { sessionless: true };
  }
  return { sessionless: false };
}
