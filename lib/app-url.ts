export function publicAppOrigin(): string | null {
  const raw = process.env.AUTH_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function telegramSummaryMiniAppUrl(): string | null {
  const origin = publicAppOrigin();
  if (!origin) {
    return null;
  }
  return `${origin}/summary?embed=tg`;
}

export function groupInviteUrl(token: string): string | null {
  const origin = publicAppOrigin();
  if (!origin) {
    return null;
  }
  return `${origin}/g/${token}`;
}

export function telegramGroupInviteUrl(token: string): string | null {
  const origin = publicAppOrigin();
  if (!origin) {
    return null;
  }
  return `${origin}/g/${token}?embed=tg`;
}

export function telegramBotStartInviteUrl(token: string): string | null {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) {
    return null;
  }
  const username = raw.replace(/^@/u, "");
  return `https://t.me/${username}?start=g_${token}`;
}

export function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export type GroupInviteLinks = {
  readonly telegramInviteUrl: string | null;
  readonly webInviteUrl: string | null;
};

export function groupInviteLinks(token: string): GroupInviteLinks {
  return {
    telegramInviteUrl: telegramBotStartInviteUrl(token),
    webInviteUrl: groupInviteUrl(token),
  };
}
