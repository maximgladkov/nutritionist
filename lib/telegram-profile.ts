// What Telegram tells the bot about a person who linked it: their name, their birth date if they
// show one with the year, and their photo.

export type TelegramProfile = { birthDate: string | null; name: string | null; photoFileId: string | null };

export type TelegramProfileClient = {
  // Null when the bot can't see them (they never opened it, or blocked it).
  profile(telegramUserId: string): Promise<TelegramProfile | null>;
  photo(fileId: string): Promise<Uint8Array | null>;
};

const TIMEOUT_MS = 5_000;

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) {
    return null;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await response.json()) as { ok: boolean; result?: T };
    return json.ok ? (json.result ?? null) : null;
  } catch {
    return null;
  }
}

type Chat = {
  birthdate?: { day: number; month: number; year?: number };
  first_name?: string;
  last_name?: string;
  photo?: { big_file_id: string };
};

export function readTelegramChat(chat: Chat): TelegramProfile {
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ").trim().slice(0, 80);
  const born = chat.birthdate;
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    birthDate: born?.year ? `${born.year}-${pad(born.month)}-${pad(born.day)}` : null,
    name: name || null,
    photoFileId: chat.photo?.big_file_id ?? null,
  };
}

export const telegramProfileClient: TelegramProfileClient = {
  async profile(telegramUserId) {
    const chat = await call<Chat>("getChat", { chat_id: telegramUserId });
    return chat ? readTelegramChat(chat) : null;
  },
  async photo(fileId) {
    const file = await call<{ file_path?: string }>("getFile", { file_id: fileId });
    const token = botToken();
    if (!file?.file_path || !token) {
      return null;
    }
    try {
      const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    } catch {
      return null;
    }
  },
};
