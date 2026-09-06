import type { CatalogProductImageView } from "./open-food-facts-map.ts";
import { prisma } from "./prisma.ts";
import {
  resolveTurnPhotoLinks,
  type CatalogPhotoInput,
} from "./catalog-product-images-query.ts";
import { catalogImageUrl, listTurnImageAttachments } from "./user-attachments.ts";

export {
  primaryCatalogImageUrl,
  resolveTurnPhotoLinks,
  toCatalogImageViews,
  withCatalogImages,
  type CatalogPhotoInput,
  type CatalogPhotoLink,
} from "./catalog-product-images-query.ts";

export async function loadCatalogImagesByBarcodes(
  barcodes: readonly string[],
): Promise<Map<string, CatalogProductImageView[]>> {
  const unique = [...new Set(barcodes.filter((barcode) => barcode.length > 0))];
  const byBarcode = new Map<string, CatalogProductImageView[]>();
  if (unique.length === 0) {
    return byBarcode;
  }
  const rows = await prisma.catalogProductImage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { barcode: true, id: true, kind: true },
    where: { barcode: { in: [...unique] } },
  });
  for (const row of rows) {
    const list = byBarcode.get(row.barcode) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      url: catalogImageUrl(row.id),
    });
    byBarcode.set(row.barcode, list);
  }
  return byBarcode;
}

export async function attachCatalogProductPhotos(input: {
  barcode: string;
  photos: readonly CatalogPhotoInput[] | undefined;
  sessionId: string | undefined;
  turnId: string | undefined;
}): Promise<CatalogProductImageView[]> {
  if (
    input.photos === undefined ||
    input.photos.length === 0 ||
    input.sessionId === undefined ||
    input.turnId === undefined
  ) {
    const existing = await loadCatalogImagesByBarcodes([input.barcode]);
    return existing.get(input.barcode) ?? [];
  }
  const attachments = await listTurnImageAttachments(input.sessionId, input.turnId);
  const links = resolveTurnPhotoLinks(attachments, input.photos);
  for (const link of links) {
    try {
      await prisma.catalogProductImage.upsert({
        create: {
          attachmentId: link.attachmentId,
          barcode: input.barcode,
          kind: link.kind,
          sortOrder: link.sortOrder,
        },
        update: {
          kind: link.kind,
          sortOrder: link.sortOrder,
        },
        where: {
          barcode_attachmentId: {
            attachmentId: link.attachmentId,
            barcode: input.barcode,
          },
        },
      });
    } catch (error) {
      console.error("catalog product image attach failed", error);
    }
  }
  const images = await loadCatalogImagesByBarcodes([input.barcode]);
  return images.get(input.barcode) ?? [];
}

export async function getCatalogProductImage(id: string) {
  return prisma.catalogProductImage.findUnique({
    include: { attachment: true },
    where: { id },
  });
}
