"use client";

import { AgentChat } from "@/app/_components/agent-chat";
import { DesktopSettings } from "@/app/_components/desktop-settings";
import {
  DesktopWorkspaceContext,
  type DesktopWidgetId,
} from "@/app/_components/desktop-workspace-context";
import { NutritionSummaryApp } from "@/app/_components/nutrition-summary";
import { ProductsApp } from "@/app/_components/products-app";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { ArrowRightFromSquare } from "@gravity-ui/icons";
import { Widget } from "@heroui-pro/react";
import { Button, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";

const DESKTOP_MQ = "(min-width: 1024px)";
const SCREEN_SIZE = "h-[min(44rem,72dvh)] w-[36vw] min-w-[22rem]";

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
  const [front, setFront] = useState<DesktopWidgetId>("summary");
  const chat = chatSessionFromPath(pathname);
  const api = useMemo(
    () => ({
      focusWidget: setFront,
    }),
    [],
  );

  return (
    <DesktopWorkspaceContext.Provider value={api}>
      <div className="bg-background relative h-dvh overflow-hidden">
        <div className="absolute top-4 right-6 z-40 flex max-w-[min(24rem,calc(100%-2rem))] items-center gap-3">
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
        <DesktopScreen
          className="top-[12%] left-[5vw] -translate-y-4 -rotate-2"
          front={front}
          id="chat"
          label={t`Chat`}
          onFront={setFront}
        >
          <AgentChat
            compact
            key={chat.sessionId ?? (chat.sessionless ? "new" : "home")}
            sessionId={chat.sessionId}
            sessionless={chat.sessionless}
          />
        </DesktopScreen>
        <DesktopScreen
          className="top-[22%] left-[22vw] translate-y-2 rotate-1"
          front={front}
          id="products"
          label={t`Products`}
          onFront={setFront}
        >
          <ProductsApp compact />
        </DesktopScreen>
        <DesktopScreen
          className="top-[16%] left-1/2 -translate-x-1/2 translate-y-4"
          front={front}
          id="summary"
          label={t`Summary`}
          onFront={setFront}
        >
          <NutritionSummaryApp compact embed={false} />
        </DesktopScreen>
        <DesktopScreen
          className="top-[13%] right-[5vw] -translate-y-1 rotate-2"
          front={front}
          id="settings"
          label={t`Settings`}
          onFront={setFront}
        >
          <DesktopSettings />
        </DesktopScreen>
      </div>
    </DesktopWorkspaceContext.Provider>
  );
}

function DesktopScreen({
  children,
  className,
  front,
  id,
  label,
  onFront,
}: {
  readonly children: ReactNode;
  readonly className: string;
  readonly front: DesktopWidgetId;
  readonly id: DesktopWidgetId;
  readonly label: string;
  readonly onFront: (id: DesktopWidgetId) => void;
}) {
  return (
    <div
      className={cn("absolute", SCREEN_SIZE, className, stackClass(id, front))}
      onPointerDown={() => onFront(id)}
      onPointerEnter={() => onFront(id)}
    >
      <Widget aria-label={label} className="shadow-overlay ring-foreground/8 h-full w-full ring-1">
        <Widget.Content
          className={
            id === "chat" || id === "products" ? "flex min-h-0 flex-col p-0" : "min-h-0 p-0"
          }
        >
          {children}
        </Widget.Content>
      </Widget>
    </div>
  );
}

function stackClass(id: DesktopWidgetId, front: DesktopWidgetId): string {
  if (id === front) {
    return "z-30";
  }
  if (id === "summary") {
    return "z-20";
  }
  if (id === "products") {
    return "z-[15]";
  }
  return "z-10";
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
