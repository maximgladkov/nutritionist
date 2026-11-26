import { randomBytes } from "node:crypto";
import { apiDeps } from "./api/deps.ts";
import { sniffImageMediaType } from "./image-bytes.ts";
import { GroupError, GROUP_IMAGE_MAX_BYTES, groupCoverBlobPath } from "./groups-core.ts";

export async function uploadGroupCover(input: {
  file: File;
  groupId: string;
}): Promise<{ imageBlobPath: string; imageUrl: string }> {
  if (input.file.size === 0 || input.file.size > GROUP_IMAGE_MAX_BYTES) {
    throw new GroupError("Choose a smaller image.");
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const mediaType = sniffImageMediaType(bytes.subarray(0, 12));
  if (!mediaType) {
    throw new GroupError("Choose a JPEG, PNG, GIF, or WebP image.");
  }
  const blobPath = groupCoverBlobPath(input.groupId, mediaType, randomBytes(6).toString("hex"));
  const uploaded = await apiDeps().blobs.putPublic(blobPath, bytes, mediaType);
  return { imageBlobPath: uploaded.pathname, imageUrl: uploaded.url };
}

// A cover that was replaced or removed; the group is saved either way.
export async function discardGroupCover(imageUrl: string): Promise<void> {
  if (!imageUrl) {
    return;
  }
  await apiDeps()
    .blobs.remove(imageUrl)
    .catch(() => undefined);
}
