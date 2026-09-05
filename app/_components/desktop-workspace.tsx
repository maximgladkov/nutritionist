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
import { ArrowRightFromSquare, ChartColumn, Comment, Gear, ShoppingBag } from "@gravity-ui/icons";
import { Widget } from "@heroui-pro/react";
import { Button, ScrollShadow, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePathname } from "next/navigation";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";

const DESKTOP_MQ = "(min-width: 1024px)";
const SCREEN_SIZE = "h-[min(44rem,calc(100dvh-9rem))] w-[min(28rem,80vw)] min-w-[22rem]";

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
  const screenRefs = useRef<Partial<Record<DesktopWidgetId, HTMLDivElement | null>>>({});
  const chat = chatSessionFromPath(pathname);
  const api = useMemo(
    () => ({
      focusWidget: (id: DesktopWidgetId) => {
        screenRefs.current[id]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      },
    }),
    [],
  );

  return (
    <DesktopWorkspaceContext.Provider value={api}>
      <div className="bg-background flex h-dvh flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-end gap-3 px-6 py-3">
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
        <ScrollShadow hideScrollBar className="min-h-0 w-full flex-1" orientation="horizontal">
          <div className="flex min-h-full w-max items-center gap-8 px-8 py-4">
            <DesktopScreen
              icon={Comment}
              id="chat"
              label={t`Chat`}
              screenRef={(node) => {
                screenRefs.current.chat = node;
              }}
            >
              <AgentChat
                compact
                key={chat.sessionId ?? (chat.sessionless ? "new" : "home")}
                sessionId={chat.sessionId}
                sessionless={chat.sessionless}
              />
            </DesktopScreen>
            <DesktopScreen
              icon={ChartColumn}
              id="summary"
              label={t`Summary`}
              screenRef={(node) => {
                screenRefs.current.summary = node;
              }}
            >
              <NutritionSummaryApp compact embed={false} />
            </DesktopScreen>
            <DesktopScreen
              icon={ShoppingBag}
              id="products"
              label={t`Products`}
              screenRef={(node) => {
                screenRefs.current.products = node;
              }}
            >
              <ProductsApp compact />
            </DesktopScreen>
            <DesktopScreen
              icon={Gear}
              id="settings"
              label={t`Settings`}
              screenRef={(node) => {
                screenRefs.current.settings = node;
              }}
            >
              <DesktopSettings />
            </DesktopScreen>
          </div>
        </ScrollShadow>
      </div>
    </DesktopWorkspaceContext.Provider>
  );
}

function DesktopScreen({
  children,
  icon: Icon,
  id,
  label,
  screenRef,
}: {
  readonly children: ReactNode;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly id: DesktopWidgetId;
  readonly label: string;
  readonly screenRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-3", SCREEN_SIZE)} ref={screenRef}>
      <div className="flex items-center gap-2 px-1">
        <Icon aria-hidden className="text-muted size-5 shrink-0" />
        <h2 className="text-foreground text-sm font-semibold">{label}</h2>
      </div>
      <Widget aria-label={label} className="shadow-overlay ring-foreground/8 min-h-0 flex-1 ring-1">
        <Widget.Content
          className={
            id === "chat" || id === "products" ? "flex min-h-0 flex-1 flex-col p-0" : "min-h-0 flex-1 p-0"
          }
        >
          {children}
        </Widget.Content>
      </Widget>
    </div>
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
