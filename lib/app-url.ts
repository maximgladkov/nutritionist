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
