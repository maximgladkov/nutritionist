"use client";

import { MiniAppGroups } from "@/app/_components/mini-app-groups";
import { MiniAppSettings } from "@/app/_components/mini-app-settings";
import { MiniAppTabBar, type MiniAppTab } from "@/app/_components/mini-app-tab-bar";
import { cn } from "@/lib/utils";
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const MiniAppFoodActiveContext = createContext(true);

export function useMiniAppFoodActive() {
  return useContext(MiniAppFoodActiveContext);
}

export function MiniAppShell({ children }: { readonly children: ReactNode }) {
  const [tab, setTab] = useState<MiniAppTab>("food");
  const foodRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (tab !== "food") {
      return;
    }
    foodRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <MiniAppFoodActiveContext.Provider value={tab === "food"}>
      <div className="relative h-dvh overflow-hidden">
        <div
          className={cn(
            "h-full overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",
            tab === "food" ? "block" : "hidden",
          )}
          ref={foodRef}
        >
          {children}
        </div>
        {tab === "groups" ? (
          <div className="h-full overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
            <MiniAppGroups />
          </div>
        ) : null}
        <div
          className={cn(
            "h-full overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",
            tab === "settings" ? "block" : "hidden",
          )}
        >
          <MiniAppSettings />
        </div>
        <MiniAppTabBar selected={tab} onSelect={setTab} />
      </div>
    </MiniAppFoodActiveContext.Provider>
  );
}
