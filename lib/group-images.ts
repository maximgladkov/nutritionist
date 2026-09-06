import { put } from "@vercel/blob";
import { sniffImageMediaType } from "./image-bytes.ts";
import { GroupError, GROUP_IMAGE_MAX_BYTES } from "./groups-core.ts";

export function groupCoverBlobPath(groupId: string, mediaType: string): string {
  const ext =
    mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : mediaType === "image/gif" ? "gif" : "jpg";
  return `groups/${groupId}/cover.${ext}`;
}

export async function uploadGroupCover(input: {
  file: File;
  groupId: string;
}): Promise<{ imageBlobPath: string; imageUrl: string }> {
  if (input.file.size === 0 || input.file.size > GROUP_IMAGE_MAX_BYTES) {
    throw new GroupError("Choose a smaller image.");
  }
  const header = new Uint8Array(await input.file.slice(0, 12).arrayBuffer());
  const mediaType = sniffImageMediaType(header);
  if (!mediaType) {
    throw new GroupError("Choose a JPEG, PNG, GIF, or WebP image.");
  }
  const blobPath = groupCoverBlobPath(input.groupId, mediaType);
  const uploaded = await put(blobPath, input.file, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: mediaType,
    multipart: input.file.size > 4 * 1024 * 1024,
  });
  return { imageBlobPath: blobPath, imageUrl: uploaded.url };
}
