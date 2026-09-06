export const USER_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ADMIN_ATTACHMENT_PREFIX = "/admin/attachments/";
export const CATALOG_IMAGE_PREFIX = "/api/catalog-images/";
export const TELEGRAM_FILE_PREFIX = "telegram-file:";
export const EVE_URL_PREFIX = "eve-url:";

export function adminAttachmentUrl(id: string) {
  return `${ADMIN_ATTACHMENT_PREFIX}${encodeURIComponent(id)}`;
}

export function catalogImageUrl(id: string) {
  return `${CATALOG_IMAGE_PREFIX}${encodeURIComponent(id)}`;
}

export function isAdminAttachmentUrl(url: string | undefined) {
  return typeof url === "string" && url.startsWith(ADMIN_ATTACHMENT_PREFIX);
}

export function isCatalogImageUrl(url: string | undefined) {
  return typeof url === "string" && url.startsWith(CATALOG_IMAGE_PREFIX);
}

export function isHttpOrHttpsUrl(url: string | undefined) {
  return typeof url === "string" && /^https?:\/\//iu.test(url);
}

export function telegramFileIdFromUrl(url: string | undefined): string | null {
  if (typeof url !== "string" || url.length === 0) {
    return null;
  }
  const value = url.startsWith(EVE_URL_PREFIX) ? url.slice(EVE_URL_PREFIX.length) : url;
  if (!value.startsWith(TELEGRAM_FILE_PREFIX)) {
    return null;
  }
  const id = value.slice(TELEGRAM_FILE_PREFIX.length).split("?")[0]?.trim() ?? "";
  return id.length > 0 ? id : null;
}

export function recoverableAttachmentKind(
  url: string | undefined,
): "data" | "http" | "none" | "persisted" | "telegram" {
  if (isAdminAttachmentUrl(url)) {
    return "persisted";
  }
  if (typeof url !== "string" || url.length === 0) {
    return "none";
  }
  if (url.startsWith("data:")) {
    return "data";
  }
  if (telegramFileIdFromUrl(url) !== null) {
    return "telegram";
  }
  if (isHttpOrHttpsUrl(url)) {
    return "http";
  }
  return "none";
}

export function isOversizeBytes(size: number) {
  return size > USER_ATTACHMENT_MAX_BYTES;
}

export function safeAttachmentFilename(
  filename: string | undefined,
  index: number,
  mediaType: string,
) {
  const raw = filename?.trim() || fallbackFilename(index, mediaType);
  const base = raw.split(/[/\\]/u).at(-1)?.trim() || fallbackFilename(index, mediaType);
  const cleaned = base.replaceAll(/[^\w.+-]+/gu, "_").replaceAll(/^_+|_+$/gu, "");
  return cleaned.length > 0 ? cleaned.slice(0, 180) : fallbackFilename(index, mediaType);
}

export function attachmentBlobPath(sessionId: string, turnId: string, filename: string) {
  return `attachments/${sessionId}/${turnId}/${filename}`;
}

export function decodeDataUrl(url: string): { bytes: Buffer; mediaType: string } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+=*)$/u.exec(url);
  if (!match) {
    return null;
  }
  const mediaType = match[1]?.trim() ?? "";
  const payload = match[2];
  if (mediaType.length === 0 || payload === undefined) {
    return null;
  }
  try {
    const bytes = Buffer.from(payload, "base64");
    if (bytes.length === 0) {
      return null;
    }
    return { bytes, mediaType };
  } catch {
    return null;
  }
}

function fallbackFilename(index: number, mediaType: string) {
  const ext = mediaType.split("/")[1]?.replaceAll(/[^\w]+/gu, "") || "bin";
  return `file-${index}.${ext}`;
}
