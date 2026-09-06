import { telegramFileIdFromUrl, USER_ATTACHMENT_MAX_BYTES } from "./user-attachments-query.ts";

export async function fetchTelegramFileBytes(
  urlOrFileId: string,
  botToken = process.env.TELEGRAM_BOT_TOKEN,
): Promise<{ bytes: Buffer } | null> {
  const fileId = telegramFileIdFromUrl(urlOrFileId) ?? (urlOrFileId.includes("/") ? null : urlOrFileId.trim());
  if (fileId === null || fileId.length === 0 || !botToken) {
    return null;
  }
  try {
    const info = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    if (!info.ok) {
      return null;
    }
    const body = (await info.json()) as {
      ok?: boolean;
      result?: { file_path?: string };
    };
    const filePath = body.ok === true ? body.result?.file_path : undefined;
    if (typeof filePath !== "string" || filePath.length === 0) {
      return null;
    }
    const download = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!download.ok) {
      return null;
    }
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.length === 0 || bytes.length > USER_ATTACHMENT_MAX_BYTES) {
      return null;
    }
    return { bytes };
  } catch (error) {
    console.error("telegram file fetch failed", error);
    return null;
  }
}
