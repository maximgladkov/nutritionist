import type { FilePart, UserContent } from "ai";
import { isImageMediaType, looksLikeImageFilename, sniffImageMediaType } from "./image-bytes.ts";

const EVE_URL_PREFIX = "eve-url:";

export type TelegramFileFetch = (
  url: string,
) => Promise<Buffer | { bytes: Buffer; mediaType?: string } | null>;

type ChannelAdapterLike = {
  deliver?: (payload: Record<string, unknown>, ctx: unknown) => unknown;
  fetchFile?: (
    url: string,
    context?: unknown,
  ) => Promise<Buffer | { bytes: Buffer; mediaType?: string } | null>;
};

export async function inlineTelegramImages(
  content: string | UserContent,
  fetchFile: TelegramFileFetch,
): Promise<string | UserContent> {
  if (typeof content === "string" || !Array.isArray(content)) {
    return content;
  }
  const parts = await Promise.all(content.map((part) => inlineTelegramImagePart(part, fetchFile)));
  return parts as UserContent;
}

export function attachTelegramVision<T extends object>(channel: T, fetchFile: TelegramFileFetch): T {
  const adapter = (channel as { adapter?: ChannelAdapterLike }).adapter;
  if (!adapter) {
    return channel;
  }

  const originalFetch = adapter.fetchFile;
  adapter.fetchFile = async (url, context) => {
    const result = originalFetch === undefined ? await fetchFile(url) : await originalFetch(url, context);
    return withSniffedImageType(result);
  };

  const originalDeliver = adapter.deliver;
  adapter.deliver = async (payload, ctx) => {
    const delivered = originalDeliver === undefined ? undefined : await originalDeliver(payload, ctx);
    const step = isRecord(delivered) ? delivered : payload;
    if (!isRecord(step) || step.message === undefined) {
      return delivered ?? payload;
    }
    return {
      ...step,
      message: await inlineTelegramImages(step.message as string | UserContent, (url) =>
        adapter.fetchFile === undefined ? fetchFile(url) : adapter.fetchFile(url),
      ),
    };
  };

  return channel;
}

export function withSniffedImageType(
  result: Buffer | { bytes: Buffer; mediaType?: string } | null,
): Buffer | { bytes: Buffer; mediaType?: string } | null {
  if (result === null) {
    return null;
  }
  const bytes = Buffer.isBuffer(result) ? result : result.bytes;
  const sniffed = sniffImageMediaType(bytes);
  if (sniffed === null) {
    return result;
  }
  if (Buffer.isBuffer(result)) {
    return { bytes, mediaType: sniffed };
  }
  if (isImageMediaType(result.mediaType)) {
    return result;
  }
  return { ...result, mediaType: sniffed };
}

async function inlineTelegramImagePart(part: unknown, fetchFile: TelegramFileFetch) {
  if (!isFilePart(part)) {
    return part;
  }
  const url = filePartUrl(part.data);
  if (url === null) {
    return inlineLocalFilePart(part);
  }
  if (!shouldInlineAsImage(part.mediaType, part.filename)) {
    return part;
  }
  try {
    const result = await fetchFile(url);
    if (result === null) {
      return part;
    }
    const bytes = Buffer.isBuffer(result) ? result : result.bytes;
    const fetchedType = Buffer.isBuffer(result) ? undefined : result.mediaType;
    const mediaType =
      sniffImageMediaType(bytes) ??
      (isImageMediaType(fetchedType) ? fetchedType : undefined) ??
      (isImageMediaType(part.mediaType) ? part.mediaType : undefined);
    if (mediaType === undefined) {
      return part;
    }
    return visionFilePart(bytes, mediaType, part.filename);
  } catch {
    return part;
  }
}

function inlineLocalFilePart(part: FilePart): FilePart {
  const bytes = localFileBytes(part.data);
  if (bytes === null || !shouldInlineAsImage(part.mediaType, part.filename)) {
    return part;
  }
  const mediaType = sniffImageMediaType(bytes) ?? (isImageMediaType(part.mediaType) ? part.mediaType : undefined);
  if (mediaType === undefined) {
    return part;
  }
  return visionFilePart(bytes, mediaType, part.filename);
}

function visionFilePart(bytes: Uint8Array, mediaType: string, filename?: string): FilePart {
  return {
    type: "file",
    mediaType,
    ...(filename === undefined ? {} : { filename }),
    data: { type: "data", data: Buffer.from(bytes).toString("base64") },
  };
}

function shouldInlineAsImage(mediaType: string | undefined, filename: string | undefined) {
  return isImageMediaType(mediaType) || looksLikeImageFilename(filename);
}

function isFilePart(part: unknown): part is FilePart {
  return typeof part === "object" && part !== null && "type" in part && part.type === "file";
}

function filePartUrl(data: unknown): string | null {
  if (data instanceof URL) {
    return data.protocol === "data:" ? null : data.href;
  }
  if (typeof data !== "string") {
    return null;
  }
  if (data.startsWith(EVE_URL_PREFIX)) {
    return data.slice(EVE_URL_PREFIX.length);
  }
  if (data.startsWith("telegram-file:")) {
    return data;
  }
  return null;
}

function localFileBytes(data: unknown): Uint8Array | null {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
