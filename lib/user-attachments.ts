import { get, put } from "@vercel/blob";
import { isImageMediaType } from "./image-bytes.ts";
import { prisma } from "./prisma.ts";
import {
  attachmentBlobPath,
  isOversizeBytes,
  PENDING_ATTACHMENT_TURN_ID,
  safeAttachmentFilename,
} from "./user-attachments-query.ts";

export {
  ADMIN_ATTACHMENT_PREFIX,
  adminAttachmentUrl,
  attachmentBlobPath,
  CATALOG_IMAGE_PREFIX,
  catalogImageUrl,
  decodeDataUrl,
  isAdminAttachmentUrl,
  isCatalogImageUrl,
  isHttpOrHttpsUrl,
  isOversizeBytes,
  PENDING_ATTACHMENT_TURN_ID,
  recoverableAttachmentKind,
  safeAttachmentFilename,
  telegramFileIdFromUrl,
  USER_ATTACHMENT_MAX_BYTES,
} from "./user-attachments-query.ts";

export type PersistUserAttachmentInput = {
  bytes: Uint8Array;
  channel: string;
  filename?: string;
  index?: number;
  mediaType: string;
  sessionId: string;
  turnId: string;
  userId?: string | null;
};

export type PersistedUserAttachment = {
  blobPath: string;
  blobUrl: string;
  filename: string | null;
  id: string;
  mediaType: string;
  size: number | null;
};

export async function persistUserAttachment(
  input: PersistUserAttachmentInput,
): Promise<PersistedUserAttachment | null> {
  const size = input.bytes.byteLength;
  if (size === 0 || isOversizeBytes(size)) {
    return null;
  }
  const index = input.index ?? 0;
  const filename = safeAttachmentFilename(input.filename, index, input.mediaType);
  const blobPath = attachmentBlobPath(input.sessionId, input.turnId, filename, index);
  const existing = await prisma.userAttachment.findUnique({ where: { blobPath } });
  if (existing) {
    return toPersisted(existing);
  }

  let blobUrl: string;
  try {
    const uploaded = await put(blobPath, Buffer.from(input.bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: input.mediaType,
      multipart: size > 4 * 1024 * 1024,
    });
    blobUrl = uploaded.url;
  } catch (error) {
    console.error("user attachment blob upload failed", error);
    return null;
  }

  try {
    const created = await prisma.userAttachment.create({
      data: {
        blobPath,
        blobUrl,
        channel: input.channel,
        filename,
        mediaType: input.mediaType,
        sessionId: input.sessionId,
        size,
        turnId: input.turnId,
        userId: input.userId ?? null,
      },
    });
    return toPersisted(created);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.userAttachment.findUnique({ where: { blobPath } });
      return raced ? toPersisted(raced) : null;
    }
    if (isForeignKeyError(error) && input.userId) {
      return persistUserAttachment({ ...input, userId: null });
    }
    console.error("user attachment persist failed", error);
    return null;
  }
}

export async function claimPendingTurnAttachments(sessionId: string, turnId: string): Promise<void> {
  if (turnId === PENDING_ATTACHMENT_TURN_ID) {
    return;
  }
  await prisma.userAttachment.updateMany({
    data: { turnId },
    where: { sessionId, turnId: PENDING_ATTACHMENT_TURN_ID },
  });
}

export async function listTurnAttachments(sessionId: string, turnId: string): Promise<PersistedUserAttachment[]> {
  await claimPendingTurnAttachments(sessionId, turnId);
  const rows = await prisma.userAttachment.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    where: { sessionId, turnId },
  });
  return rows.map(toPersisted);
}

export async function listTurnImageAttachments(
  sessionId: string,
  turnId: string,
): Promise<PersistedUserAttachment[]> {
  const rows = await listTurnAttachments(sessionId, turnId);
  return rows.filter((row) => isImageMediaType(row.mediaType));
}

export async function getUserAttachmentById(id: string) {
  return prisma.userAttachment.findUnique({ where: { id } });
}

export async function streamPrivateAttachment(input: {
  blobUrl: string;
  cacheControl?: string;
  filename?: string | null;
  mediaType: string;
}): Promise<Response> {
  const result = await get(input.blobUrl, { access: "private" });
  if (result === null || result.statusCode !== 200 || result.stream === null) {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers();
  headers.set("Content-Type", input.mediaType || result.blob.contentType || "application/octet-stream");
  headers.set("Cache-Control", input.cacheControl ?? "private, max-age=3600");
  if (input.filename) {
    headers.set("Content-Disposition", `inline; filename="${input.filename.replaceAll('"', "")}"`);
  }
  return new Response(result.stream, { headers });
}

function toPersisted(row: {
  blobPath: string;
  blobUrl: string;
  filename: string | null;
  id: string;
  mediaType: string;
  size: number | null;
}): PersistedUserAttachment {
  return {
    blobPath: row.blobPath,
    blobUrl: row.blobUrl,
    filename: row.filename,
    id: row.id,
    mediaType: row.mediaType,
    size: row.size,
  };
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isForeignKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}
