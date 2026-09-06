import { resolveAppUser } from "@/lib/app-user";
import { getUserAttachmentById, streamPrivateAttachment } from "@/lib/user-attachments";
import { notFound } from "next/navigation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await resolveAppUser();
  if (!user.ok) {
    return new Response(user.error, { status: 401 });
  }
  const { id } = await context.params;
  const row = await getUserAttachmentById(id);
  if (!row || row.userId !== user.userId) {
    notFound();
  }
  return streamPrivateAttachment({
    blobUrl: row.blobUrl,
    filename: row.filename,
    mediaType: row.mediaType,
  });
}
