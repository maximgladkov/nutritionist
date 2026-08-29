"use client";

import { toast } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function FlashToast({
  message,
  variant,
}: {
  readonly message: string;
  readonly variant: "danger" | "success";
}) {
  const router = useRouter();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) {
      return;
    }
    shown.current = true;
    if (variant === "danger") {
      toast.danger(message);
    } else {
      toast.success(message);
    }
    router.replace("/settings", { scroll: false });
  }, [message, router, variant]);

  return null;
}
