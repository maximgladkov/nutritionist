import { formatChannelLabel } from "@/lib/admin-format";
import { Comment, Display, Envelope, LogoTelegram } from "@gravity-ui/icons";
import type { ComponentType, SVGProps } from "react";

const CHANNEL_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  email: Envelope,
  telegram: LogoTelegram,
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
  const Icon = CHANNEL_ICONS[channel] ?? Comment;
  const label = formatChannelLabel(channel);
  return (
    <span className="inline-flex items-center" title={label}>
      <Icon aria-hidden className={className} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function AdminChannelIcons({ values }: { readonly values: readonly string[] }) {
  if (values.length === 0) {
    return "—";
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((value) => (
        <AdminChannelIcon channel={value} key={value} />
      ))}
    </div>
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
