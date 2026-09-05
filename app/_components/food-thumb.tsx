"use client";

import { cn } from "@/lib/utils";
import { Avatar } from "@heroui/react";

export function FoodThumb({
  alt,
  className,
  src,
}: {
  readonly alt: string;
  readonly className?: string;
  readonly src: string | null | undefined;
}) {
  return (
    <Avatar className={cn("size-11 rounded-lg", className)}>
      {src ? <Avatar.Image alt={alt} src={src} /> : null}
      <Avatar.Fallback className="rounded-lg bg-surface-secondary" />
    </Avatar>
  );
}
