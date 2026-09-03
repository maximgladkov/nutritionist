"use client";

import { createContext, useContext } from "react";

export type DesktopWidgetId = "chat" | "settings" | "summary";

export const DesktopWorkspaceContext = createContext<{
  readonly focusWidget: (id: DesktopWidgetId) => void;
} | null>(null);

export function useDesktopWorkspace() {
  return useContext(DesktopWorkspaceContext);
}
