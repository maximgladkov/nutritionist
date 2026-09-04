import { formatChannelLabel } from "@/lib/admin-format";
import { normalizeChannelKind } from "@/lib/agent-turn-model";
import { Comment, Display, Envelope } from "@gravity-ui/icons";
import type { ComponentType, SVGProps } from "react";

const CHANNEL_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  email: Envelope,
  telegram: TelegramMark,
  web: Display,
  whatsapp: WhatsAppMark,
};

export function AdminChannelIcon({
  channel,
  className = "size-4",
}: {
  readonly channel: string;
  readonly className?: string;
}) {
  const kind = normalizeChannelKind(channel);
  const Icon = CHANNEL_ICONS[kind] ?? Comment;
  const label = formatChannelLabel(kind);
  return (
    <span className="inline-flex items-center" title={label}>
      <Icon aria-hidden className={className} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function AdminChannelIcons({ values }: { readonly values: readonly string[] }) {
  const kinds = [...new Set(values.map((value) => normalizeChannelKind(value)))];
  if (kinds.length === 0) {
    return "—";
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {kinds.map((kind) => (
        <AdminChannelIcon channel={kind} key={kind} />
      ))}
    </div>
  );
}

function TelegramMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.218.02.373-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
        fill="currentColor"
      />
    </svg>
  );
}

function WhatsAppMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        clipRule="evenodd"
        d="M8 1.5a6.5 6.5 0 0 0-5.58 9.83L1.5 14.5l3.28-.88A6.5 6.5 0 1 0 8 1.5m0 1.5a5 5 0 0 0-4.25 7.64l.22.38-.86 2.08 2.16-.58.36.2A5 5 0 1 0 8 3m2.86 6.55c-.16-.08-.94-.46-1.08-.51-.15-.06-.25-.08-.36.08-.1.16-.41.51-.5.62-.09.1-.18.12-.34.04-.16-.08-.67-.25-1.27-.79-.47-.42-.79-.94-.88-1.1-.09-.16-.01-.24.07-.32.07-.07.16-.18.24-.28.08-.09.1-.16.16-.26.05-.11.03-.2-.01-.28-.04-.08-.36-.86-.49-1.18-.13-.31-.26-.27-.36-.27h-.3c-.11 0-.28.04-.42.2-.15.16-.55.54-.55 1.32 0 .78.57 1.53.65 1.64.08.1 1.12 1.71 2.71 2.4.38.16.67.26.9.33.38.12.73.1 1 .06.3-.05.94-.38 1.07-.75.13-.37.13-.69.09-.75-.04-.07-.15-.11-.31-.19"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
