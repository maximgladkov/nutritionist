"use client";

import type { AdminRange } from "@/lib/admin-queries";
import NextLink from "next/link";

const RANGES: readonly { readonly href: AdminRange; readonly label: string }[] = [
  { href: "7d", label: "7 days" },
  { href: "30d", label: "30 days" },
  { href: "all", label: "All" },
];

export function AdminRangeLinks({
  params,
  path,
  range,
}: {
  readonly params?: Readonly<Record<string, string | undefined>>;
  readonly path: string;
  readonly range: AdminRange;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {RANGES.map((item) => (
        <NextLink
          key={item.href}
          className={item.href === range ? "text-foreground text-sm font-semibold" : "text-muted text-sm"}
          href={hrefFor(path, item.href, params)}
        >
          {item.label}
        </NextLink>
      ))}
    </div>
  );
}

function hrefFor(
  path: string,
  range: AdminRange,
  params: Readonly<Record<string, string | undefined>> | undefined,
): string {
  const search = new URLSearchParams();
  search.set("range", range);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        search.set(key, value);
      }
    }
  }
  return `${path}?${search.toString()}`;
}
