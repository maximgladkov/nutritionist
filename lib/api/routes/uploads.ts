import { randomUUID } from "node:crypto";
import { sniffImageMediaType } from "../../image-bytes.ts";
import { prisma } from "../../prisma.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, invalid, notFound } from "../errors.ts";
import type { RouteDefinition } from "../router.ts";
import { attachmentUrl } from "../views.ts";

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const API_UPLOAD_SESSION = "api-upload";

const EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function readUploadBytes(request: Request): Promise<{ bytes: Uint8Array; filename: string | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw invalid("Attach the image as a `file` field.");
    }
    return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name || null };
  }
  return { bytes: new Uint8Array(await request.arrayBuffer()), filename: null };
}

export async function requireOwnedAttachments(userId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const rows = await prisma.userAttachment.findMany({ where: { id: { in: unique }, userId } });
  if (rows.length !== unique.length) {
    throw notFound("Upload not found.");
  }
  return rows;
}

export async function readAttachmentBytes(row: { blobUrl: string; mediaType: string }): Promise<Uint8Array> {
  const stored = await apiDeps().blobs.read(row.blobUrl);
  if (!stored) {
    throw notFound("Upload not found.");
  }
  return new Uint8Array(await new Response(stored.body).arrayBuffer());
}

// A meal photo, opened by the owner of a group its member shares their diary with. The same rule as
// the member's day: sharing is on, and both the group and the member include meals and photos.
async function isSharedMealPhoto(attachmentId: string, ownerId: string): Promise<boolean> {
  const photo = await prisma.mealPhoto.findFirst({
    select: { id: true },
    where: {
      attachmentId,
      meal: {
        user: {
          groupMemberships: {
            some: {
              allowedShares: { hasEvery: ["meals", "photos"] },
              group: { ownerId, shares: { hasEvery: ["meals", "photos"] } },
              sharing: true,
            },
          },
        },
      },
    },
  });
  return photo !== null;
}

export const uploadRoutes: RouteDefinition[] = [
  {
    async handler({ request, user }) {
      const { bytes, filename } = await readUploadBytes(request);
      if (bytes.byteLength === 0) {
        throw invalid("The image is empty.");
      }
      if (bytes.byteLength > UPLOAD_MAX_BYTES) {
        throw new ApiError(413, "too_large", "Choose an image under 10 MB.");
      }
      const mediaType = sniffImageMediaType(bytes.subarray(0, 16));
      if (!mediaType || !EXTENSIONS[mediaType]) {
        throw new ApiError(415, "unsupported_media_type", "Choose a JPEG, PNG, GIF, or WebP image.");
      }
      const uploadId = randomUUID();
      const blobPath = `users/${user.id}/uploads/${uploadId}.${EXTENSIONS[mediaType]}`;
      const stored = await apiDeps().blobs.put(blobPath, bytes, mediaType);
      const row = await prisma.userAttachment.create({
        data: {
          blobPath,
          blobUrl: stored.url,
          channel: "app",
          filename,
          mediaType,
          sessionId: API_UPLOAD_SESSION,
          size: bytes.byteLength,
          turnId: uploadId,
          userId: user.id,
        },
      });
      return { mediaType, size: row.size, uploadId: row.id, url: attachmentUrl(row.id) };
    },
    method: "POST",
    path: "/uploads",
  },
  {
    async handler({ params, user }) {
      const row = await prisma.userAttachment.findUnique({ where: { id: params.id } });
      const own = row?.userId === user.id;
      if (!row || !(own || (await isSharedMealPhoto(row.id, user.id)))) {
        throw notFound("Upload not found.");
      }
      const stored = await apiDeps().blobs.read(row.blobUrl);
      if (!stored) {
        throw notFound("Upload not found.");
      }
      return new Response(stored.body, {
        // A member's photo isn't kept, so it's gone for the owner once they stop sharing.
        headers: { "Cache-Control": own ? "private, max-age=3600" : "private, no-store", "Content-Type": row.mediaType || stored.contentType },
      });
    },
    method: "GET",
    path: "/uploads/:id/content",
  },
];
