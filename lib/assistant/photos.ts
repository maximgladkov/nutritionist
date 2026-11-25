import type { LanguageModelV4FilePart, LanguageModelV4Message, LanguageModelV4Prompt } from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";
import type { MessageContent } from "eve/channels";
import type { AgentTurnUserPart } from "../agent-turn-model.ts";
import { apiDeps } from "../api/deps.ts";
import { sniffImageMediaType } from "../image-bytes.ts";
import { mediaRef, readMediaRef } from "../media-ref.ts";
import { prisma } from "../prisma.ts";
import { fetchTelegramFileBytes } from "../telegram-file.ts";

// Photos a message may carry: enough for a long menu.
export const ASSISTANT_MAX_PHOTOS = 8;
// Earlier photos are kept in view only while they fit; some models refuse a request over about 4.5 MB.
export const PHOTOS_MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_CACHE = 16;

export const EARLIER_PHOTO_NOTE = "[A photo sent earlier in the conversation, no longer in view. Ask for it again if it matters.]";
export const MISSING_PHOTO_NOTE = "[A photo that could not be opened. Ask them to send it again.]";

// The app uploads a photo first and sends only this link, so messages stay small wherever they're
// kept. The link is never fetched: it names an upload, read when the model is called.
const PHOTO_LINK = /^https:\/\/btr\.me\/api\/v1\/uploads\/([A-Za-z0-9_-]{1,64})\/content$/u;

export function photoId(link: string | undefined): string | null {
  return (link && PHOTO_LINK.exec(link)?.[1]) || null;
}

export function photoLink(id: string): string {
  return `https://btr.me/api/v1/uploads/${id}/content`;
}

// The transcript keeps an attachment's name, not the reference behind it.
const PHOTO_NAME = /^upload-([A-Za-z0-9_-]{1,64})$/u;

export function attachedPhotoLink(filename: string | undefined): string | undefined {
  const id = filename && PHOTO_NAME.exec(filename)?.[1];
  return id ? photoLink(id) : undefined;
}

// Uploads go on as references, which eve keeps as they are.
export function referToPhotos(message: MessageContent): MessageContent {
  if (typeof message === "string") return message;
  return message.map((part) => {
    const id = part.type === "file" ? photoId(linkOf(part.data)) : null;
    if (part.type !== "file" || !id) return part;
    return { ...part, data: mediaRef("upload", id) as unknown as string, filename: `upload-${id}` };
  });
}

function linkOf(data: unknown): string | undefined {
  if (data instanceof URL) return data.href;
  return typeof data === "string" ? data.replace(/^eve-url:/u, "") : undefined;
}

export class PhotoError extends Error {}

// Everything the app attaches must be an upload of the person sending it, and nobody else's upload
// may be attached from anywhere.
export async function requireOwnPhotos(message: MessageContent, caller: { channel: string; userId: string }): Promise<void> {
  if (typeof message === "string") {
    return;
  }
  const ids: string[] = [];
  for (const part of message) {
    if (part.type !== "file") continue;
    if (typeof part.data === "object" && !(part.data instanceof URL)) throw new PhotoError("Only files can be attached.");
    const id = photoId(linkOf(part.data));
    if (id) ids.push(id);
    else if (caller.channel === "app") throw new PhotoError("Only uploaded photos can be attached.");
  }
  if (ids.length === 0) {
    return;
  }
  if (ids.length > ASSISTANT_MAX_PHOTOS) {
    throw new PhotoError(`Attach up to ${ASSISTANT_MAX_PHOTOS} photos.`);
  }
  const unique = [...new Set(ids)];
  const owned = await prisma.userAttachment.count({
    where: { id: { in: unique }, mediaType: { startsWith: "image/" }, userId: caller.userId },
  });
  if (owned !== unique.length) {
    throw new PhotoError("Upload not found.");
  }
}

export function photosIn(parts: readonly AgentTurnUserPart[] | undefined): { id: string; url: string }[] {
  return (parts ?? []).flatMap((part) => {
    const id = part.type === "file" ? photoId(part.url) : null;
    return id ? [{ id, url: `/api/v1/uploads/${id}/content` }] : [];
  });
}

type Photo = { bytes: Uint8Array; mediaType?: string };
export type LoadPhoto = (id: string) => Promise<Photo | null>;

const cache = new Map<string, Photo>();

// One reply calls the model several times with the same photos.
export async function loadPhoto(id: string): Promise<Photo | null> {
  const row = await prisma.userAttachment.findUnique({ where: { id } });
  // A deleted account's uploads have no owner, and aren't shown to anyone.
  if (!row?.userId) {
    return null;
  }
  const kept = cache.get(id);
  if (kept) {
    return kept;
  }
  const stored = await apiDeps().blobs.read(row.blobUrl);
  if (!stored) {
    return null;
  }
  const photo = { bytes: new Uint8Array(await new Response(stored.body).arrayBuffer()), mediaType: row.mediaType };
  cache.set(id, photo);
  if (cache.size > PHOTO_CACHE) cache.delete(cache.keys().next().value!);
  return photo;
}

// A file sent in Telegram: a photo, a voice note or a video.
export async function loadTelegramFile(id: string): Promise<Photo | null> {
  const kept = cache.get(`telegram:${id}`);
  if (kept) {
    return kept;
  }
  const file = await fetchTelegramFileBytes(id);
  if (!file) {
    return null;
  }
  const photo = { bytes: new Uint8Array(file.bytes), mediaType: sniffImageMediaType(file.bytes) ?? undefined };
  cache.set(`telegram:${id}`, photo);
  if (cache.size > PHOTO_CACHE) cache.delete(cache.keys().next().value!);
  return photo;
}

function linkedFile(part: LanguageModelV4FilePart) {
  if (part.data.type === "reference") return readMediaRef(part.data.reference);
  const id = part.data.type === "url" ? photoId(part.data.url.toString()) : null;
  return id ? { id, kind: "upload" as const } : null;
}

type UserPart = Extract<LanguageModelV4Message, { role: "user" }>["content"][number];

function isLinkedPhoto(part: UserPart): part is LanguageModelV4FilePart {
  return part.type === "file" && linkedFile(part) !== null;
}

// Puts the photos themselves in place of their links: all of the newest message that has any, and
// earlier ones, newest first, while there's room.
export async function showPhotos(prompt: LanguageModelV4Prompt, load: LoadPhoto = loadPhoto, loadTelegram: LoadPhoto = loadTelegramFile): Promise<LanguageModelV4Prompt> {
  const next = [...prompt];
  let room = PHOTOS_MAX_BYTES;
  let left = ASSISTANT_MAX_PHOTOS;
  let newest = true;
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    const message = prompt[index]!;
    if (message.role !== "user" || !message.content.some(isLinkedPhoto)) {
      continue;
    }
    const wanted = message.content.filter(isLinkedPhoto).length;
    // A message's photos belong together: half a menu would be answered as if it were all of it.
    let photos: (Photo | null)[] = [];
    let fits = newest || (left >= wanted && room > 0);
    if (fits) {
      photos = await Promise.all(
        message.content.map(async (part) => {
          if (!isLinkedPhoto(part)) return null;
          try {
            const file = linkedFile(part)!;
            return await (file.kind === "telegram" ? loadTelegram : load)(file.id);
          } catch (error) {
            console.error("assistant photo load failed", error);
            return null;
          }
        }),
      );
      const size = photos.reduce((sum, photo) => sum + (photo?.bytes.byteLength ?? 0), 0);
      fits = newest || size <= room;
      if (fits) {
        room -= size;
        left -= wanted;
      } else {
        room = 0;
      }
    }
    next[index] = {
      ...message,
      content: message.content.map((part, at): UserPart => {
        if (!isLinkedPhoto(part)) return part;
        if (!fits) return { text: EARLIER_PHOTO_NOTE, type: "text" };
        const photo = photos[at];
        if (!photo) return { text: MISSING_PHOTO_NOTE, type: "text" };
        return { data: { data: photo.bytes, type: "data" }, mediaType: photo.mediaType ?? part.mediaType, type: "file" };
      }),
    };
    newest = false;
  }
  return next;
}

// Last, so the model sees the photos and nothing else has to carry them.
export const photosMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v4",
  transformParams: async ({ params }) => ({ ...params, prompt: await showPhotos(params.prompt) }),
};
