"use client";

import { useCatalogSearch } from "@/app/_components/catalog-search";
import { CatalogSearchField, CatalogSearchToggle } from "@/app/_components/catalog-search-chrome";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { cn } from "@/lib/utils";
import { ChartColumn, Comment, Gear, PersonFill, ShoppingBag } from "@gravity-ui/icons";
import { Segment } from "@heroui-pro/react";
import { useLingui } from "@lingui/react/macro";
import { useEffect, type ComponentType, type SVGProps } from "react";

function Utensils(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="none"
      viewBox="0 0 16 16"
      {...props}
    >
      <path
        fill="currentColor"
        d="M7.333 6H6V1.333H4.667v4.667H3.333V1.333H2v4.667c0 1.413 1.107 2.56 2.5 2.647V14.667h1.667V8.647C7.56 8.56 8.667 7.413 8.667 6V1.333H7.333zm3.334-2v5.333h1.666v5.334H14V1.333c-1.84 0-3.333 1.494-3.333 2.667"
      />
    </svg>
  );
}

export const MINI_APP_TABS = ["food", "products", "groups", "settings"] as const;
export type MiniAppTab = (typeof MINI_APP_TABS)[number];

export type AppTab<T extends string> = {
  readonly id: T;
  readonly label: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const FAB_SLOT = "pe-[4.75rem]";
const SAFE_BOTTOM = "bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]";

export function AppTabBar<T extends string>({
  ariaLabel,
  onSelect,
  searchEnabled = false,
  selected,
  tabs,
}: {
  readonly ariaLabel: string;
  readonly onSelect: (tab: T) => void;
  readonly searchEnabled?: boolean;
  readonly selected: T;
  readonly tabs: readonly AppTab<T>[];
}) {
  const { locale } = useAppLocale();
  const search = useCatalogSearch();
  const searchOpen = searchEnabled && search.open;

  useEffect(() => {
    if (!searchEnabled) {
      search.closeSearch();
    }
  }, [search.closeSearch, searchEnabled]);

  return (
    <nav
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex items-end px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
        searchEnabled && !searchOpen ? FAB_SLOT : null,
        searchOpen ? null : "justify-center",
      )}
    >
      {searchOpen ? (
        <CatalogSearchField className="pointer-events-auto" />
      ) : (
        <Segment
          aria-label={ariaLabel}
          className={cn(
            "border-border/70 bg-surface/95 shadow-overlay pointer-events-auto rounded-full border p-1.5 backdrop-blur-xl",
            "**:data-[slot=segment-indicator]:bg-accent/12 **:data-[slot=segment-indicator]:shadow-none",
          )}
          key={locale}
          selectedKey={selected}
          onSelectionChange={(key) => {
            const tab = tabs.find((item) => item.id === key);
            if (tab) {
              onSelect(tab.id);
            }
          }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Segment.Item
                className="text-foreground h-auto min-w-[3.75rem] flex-col gap-0.5 px-2.5 py-1.5 text-[11px] leading-none data-[selected=true]:text-accent [&_svg]:size-5"
                id={tab.id}
                key={tab.id}
              >
                <Icon />
                {tab.label}
              </Segment.Item>
            );
          })}
        </Segment>
      )}
      {searchEnabled && !searchOpen ? (
        <div className={cn("pointer-events-auto absolute right-4", SAFE_BOTTOM)}>
          <CatalogSearchToggle />
        </div>
      ) : null}
    </nav>
  );
}

export function MiniAppTabBar({
  onSelect,
  selected,
}: {
  readonly onSelect: (tab: MiniAppTab) => void;
  readonly selected: MiniAppTab;
}) {
  const { t } = useLingui();
  const tabs: readonly AppTab<MiniAppTab>[] = [
    { id: "food", label: t`Food`, icon: Utensils },
    { id: "products", label: t`Products`, icon: ShoppingBag },
    { id: "groups", label: t`Groups`, icon: PersonFill },
    { id: "settings", label: t`Settings`, icon: Gear },
  ];

  return (
    <AppTabBar
      ariaLabel={t`Mini app`}
      searchEnabled={selected === "products"}
      selected={selected}
      tabs={tabs}
      onSelect={onSelect}
    />
  );
}

export const WEB_APP_TABS = ["chat", "summary", "products", "groups", "settings"] as const;
export type WebAppTab = (typeof WEB_APP_TABS)[number];

export function WebAppTabBar({
  onSelect,
  selected,
}: {
  readonly onSelect: (tab: WebAppTab) => void;
  readonly selected: WebAppTab;
}) {
  const { t } = useLingui();
  const tabs: readonly AppTab<WebAppTab>[] = [
    { id: "chat", label: t`Chat`, icon: Comment },
    { id: "summary", label: t`Summary`, icon: ChartColumn },
    { id: "products", label: t`Products`, icon: ShoppingBag },
    { id: "groups", label: t`Groups`, icon: PersonFill },
    { id: "settings", label: t`Settings`, icon: Gear },
  ];

  return (
    <AppTabBar
      ariaLabel={t`Navigation`}
      searchEnabled={selected === "products"}
      selected={selected}
      tabs={tabs}
      onSelect={onSelect}
    />
  );
}
