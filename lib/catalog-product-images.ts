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

export async function loadCatalogImagesByProductIds(
  ids: readonly string[],
): Promise<Map<string, CatalogProductImageView[]>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const byProductId = new Map<string, CatalogProductImageView[]>();
  if (unique.length === 0) {
    return byProductId;
  }
  const rows = await prisma.catalogProductImage.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, productId: true },
    where: { productId: { in: [...unique] } },
  });
  for (const row of rows) {
    const list = byProductId.get(row.productId) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      url: catalogImageUrl(row.id),
    });
    byProductId.set(row.productId, list);
  }
  return byProductId;
}

export async function loadCatalogImagesByBarcodes(
  barcodes: readonly string[],
): Promise<Map<string, CatalogProductImageView[]>> {
  const unique = [...new Set(barcodes.filter((barcode) => barcode.length > 0))];
  const byBarcode = new Map<string, CatalogProductImageView[]>();
  if (unique.length === 0) {
    return byBarcode;
  }
  const products = await prisma.catalogProduct.findMany({
    select: { barcode: true, id: true },
    where: { barcode: { in: [...unique] } },
  });
  const images = await loadCatalogImagesByProductIds(products.map((product) => product.id));
  for (const product of products) {
    if (!product.barcode) {
      continue;
    }
    byBarcode.set(product.barcode, images.get(product.id) ?? []);
  }
  return byBarcode;
}

export async function loadCatalogImagesByNames(
  names: readonly string[],
): Promise<Map<string, CatalogProductImageView[]>> {
  const unique = [...new Set(names.map((name) => name.trim()).filter((name) => name.length > 0))];
  const byName = new Map<string, CatalogProductImageView[]>();
  if (unique.length === 0) {
    return byName;
  }
  const products = await prisma.catalogProduct.findMany({
    select: { id: true, name: true },
    where: { barcode: null, name: { in: unique, mode: "insensitive" } },
  });
  const images = await loadCatalogImagesByProductIds(products.map((product) => product.id));
  for (const product of products) {
    byName.set(product.name.trim().toLowerCase(), images.get(product.id) ?? []);
  }
  return byName;
}

export async function attachCatalogProductPhotos(input: {
  photos: readonly CatalogPhotoInput[] | undefined;
  productId: string;
  sessionId: string | undefined;
  turnId: string | undefined;
}): Promise<CatalogProductImageView[]> {
  if (
    input.photos === undefined ||
    input.photos.length === 0 ||
    input.sessionId === undefined ||
    input.turnId === undefined
  ) {
    const existing = await loadCatalogImagesByProductIds([input.productId]);
    return existing.get(input.productId) ?? [];
  }
  const attachments = await listTurnImageAttachments(input.sessionId, input.turnId);
  const links = resolveTurnPhotoLinks(attachments, input.photos);
  for (const link of links) {
    try {
      await prisma.catalogProductImage.upsert({
        create: {
          attachmentId: link.attachmentId,
          kind: link.kind,
          productId: input.productId,
          sortOrder: link.sortOrder,
        },
        update: {
          kind: link.kind,
          sortOrder: link.sortOrder,
        },
        where: {
          productId_attachmentId: {
            attachmentId: link.attachmentId,
            productId: input.productId,
          },
        },
      });
    } catch (error) {
      console.error("catalog product image attach failed", error);
    }
  }
  const images = await loadCatalogImagesByProductIds([input.productId]);
  return images.get(input.productId) ?? [];
}

export async function getCatalogProductImage(id: string) {
  return prisma.catalogProductImage.findUnique({
    include: { attachment: true },
    where: { id },
  });
}
