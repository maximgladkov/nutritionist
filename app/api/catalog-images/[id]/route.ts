import { getCatalogProductImage } from "@/lib/catalog-product-images";
import { streamPrivateAttachment } from "@/lib/user-attachments";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const row = await getCatalogProductImage(id);
  if (!row) {
    return new Response("Not found", { status: 404 });
  }
  return streamPrivateAttachment({
    blobUrl: row.attachment.blobUrl,
    cacheControl: "public, max-age=86400, immutable",
    filename: row.attachment.filename,
    mediaType: row.attachment.mediaType,
  });
}