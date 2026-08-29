"use client";

import { Toast } from "@heroui/react";

export function ToastHost() {
  return <Toast.Provider placement="top" width="min(24rem, calc(100vw - 1.5rem))" />;
}
