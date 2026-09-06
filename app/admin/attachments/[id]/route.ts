import { requireAdmin } from "@/lib/admin-guard";
import { getUserAttachmentById, streamPrivateAttachment } from "@/lib/user-attachments";
import { notFound } from "next/navigation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await context.params;
  const row = await getUserAttachmentById(id);
  if (!row) {
    notFound();
  }
  return streamPrivateAttachment({
    blobUrl: row.blobUrl,
    filename: row.filename,
    mediaType: row.mediaType,
  });
}