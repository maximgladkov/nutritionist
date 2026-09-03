"use client";

import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { cn } from "@/lib/utils";
import { Cup, Gear, PersonFill } from "@gravity-ui/icons";
import { Segment } from "@heroui-pro/react";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType, SVGProps } from "react";

export const MINI_APP_TABS = ["food", "groups", "settings"] as const;
export type MiniAppTab = (typeof MINI_APP_TABS)[number];

function isMiniAppTab(key: unknown): key is MiniAppTab {
  return key === "food" || key === "groups" || key === "settings";
}

export function MiniAppTabBar({
  onSelect,
  selected,
}: {
  readonly onSelect: (tab: MiniAppTab) => void;
  readonly selected: MiniAppTab;
}) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  const tabs: readonly {
    id: MiniAppTab;
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
  }[] = [
    { id: "food", label: t`Food`, icon: Cup },
    { id: "groups", label: t`Groups`, icon: PersonFill },
    { id: "settings", label: t`Settings`, icon: Gear },
  ];

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
      <Segment
        aria-label={t`Mini app`}
        className={cn(
          "border-border/70 bg-surface/95 shadow-overlay pointer-events-auto rounded-full border p-1.5 backdrop-blur-xl",
          "**:data-[slot=segment-indicator]:bg-accent/12 **:data-[slot=segment-indicator]:shadow-none",
        )}
        key={locale}
        selectedKey={selected}
        onSelectionChange={(key) => {
          if (isMiniAppTab(key)) {
            onSelect(key);
          }
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Segment.Item
              className="text-foreground h-auto min-w-[4.75rem] flex-col gap-0.5 px-3.5 py-1.5 text-[11px] leading-none data-[selected=true]:text-accent [&_svg]:size-5"
              id={tab.id}
              key={tab.id}
            >
              <Icon />
              {tab.label}
            </Segment.Item>
          );
        })}
      </Segment>
    </nav>
  );
}
