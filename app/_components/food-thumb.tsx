"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function FoodThumb({
  alt,
  className,
  src,
}: {
  readonly alt: string;
  readonly className?: string;
  readonly src: string | null | undefined;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <span
      className={cn(
        "bg-surface-secondary flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg p-0.5",
        className,
      )}
    >
      {src && !failed ? (
        <img
          alt={alt}
          className="max-w-full max-h-full rounded"
          src={src}
          onError={() => {
            setFailed(true);
          }}
        />
      ) : null}
    </span>
  );
}
