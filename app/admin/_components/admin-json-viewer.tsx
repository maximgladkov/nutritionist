"use client";

import { cn } from "@/lib/utils";
import { ScrollShadow } from "@heroui/react";
import JsonView from "@uiw/react-json-view";
import { useMemo, type CSSProperties } from "react";

const jsonViewTheme = {
  "--w-rjv-arrow-color": "var(--muted)",
  "--w-rjv-background-color": "transparent",
  "--w-rjv-brackets-color": "var(--muted)",
  "--w-rjv-colon-color": "var(--muted)",
  "--w-rjv-color": "var(--foreground)",
  "--w-rjv-copied-color": "var(--muted)",
  "--w-rjv-copied-success-color": "var(--success)",
  "--w-rjv-curlybraces-color": "var(--muted)",
  "--w-rjv-font-family": "var(--font-mono)",
  "--w-rjv-info-color": "var(--muted)",
  "--w-rjv-key-string": "var(--accent)",
  "--w-rjv-line-color": "var(--separator)",
  "--w-rjv-quotes-color": "var(--accent)",
  "--w-rjv-quotes-string-color": "var(--success)",
  "--w-rjv-type-bigint-color": "var(--warning)",
  "--w-rjv-type-boolean-color": "var(--accent)",
  "--w-rjv-type-date-color": "var(--warning)",
  "--w-rjv-type-float-color": "var(--warning)",
  "--w-rjv-type-int-color": "var(--warning)",
  "--w-rjv-type-nan-color": "var(--warning)",
  "--w-rjv-type-null-color": "var(--muted)",
  "--w-rjv-type-string-color": "var(--success)",
  "--w-rjv-type-undefined-color": "var(--muted)",
  "--w-rjv-type-url-color": "var(--link)",
  fontSize: 12,
  lineHeight: 1.5,
} as CSSProperties;

export function AdminJsonViewer({
  label,
  tone = "neutral",
  value,
}: {
  readonly label: string;
  readonly tone?: "danger" | "neutral";
  readonly value: unknown;
}) {
  const data = useMemo(() => hydrateJson(value), [value]);
  const truncated = isTruncatedPayload(value);
  const objectValue = isJsonObject(data) ? data : { value: data };

  return (
    <div
      className={cn(
        "bg-surface-secondary overflow-hidden rounded-lg",
        tone === "danger" && "bg-danger/10",
      )}
    >
      <div className="flex items-center gap-2 px-2.5 pt-1.5">
        <p className={cn("text-xs font-medium", tone === "danger" ? "text-danger" : "text-muted")}>
          {label}
        </p>
        {truncated ? <span className="text-warning text-[11px] font-medium">Truncated</span> : null}
      </div>
      <ScrollShadow hideScrollBar className="max-h-80 overflow-y-auto px-2.5 py-1.5">
        <JsonView
          collapsed={1}
          displayDataTypes={false}
          enableClipboard
          highlightUpdates={false}
          indentWidth={12}
          shortenTextAfterLength={48}
          style={jsonViewTheme}
          value={objectValue}
          className="text-xs leading-5"
        />
      </ScrollShadow>
    </div>
  );
}

function hydrateJson(value: unknown): unknown {
  if (isTruncatedPayload(value)) {
    return tryParseJson(value.preview) ?? value.preview;
  }
  if (typeof value !== "string") {
    return value;
  }
  return tryParseJson(value.trim()) ?? value;
}

function tryParseJson(text: string): unknown | undefined {
  if (text.length < 2) {
    return undefined;
  }
  const start = text[0];
  const end = text.at(-1);
  if (!((start === "{" && end === "}") || (start === "[" && end === "]"))) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isJsonObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function isTruncatedPayload(value: unknown): value is { preview: string; truncated: true } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as { preview?: unknown; truncated?: unknown };
  return record.truncated === true && typeof record.preview === "string" && Object.keys(record).length <= 2;
}
