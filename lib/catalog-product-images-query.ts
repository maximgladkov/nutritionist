import type { CatalogImageKind, CatalogProductImageView, Product } from "./open-food-facts-map.ts";
import { catalogImageUrl } from "./user-attachments-query.ts";

export type CatalogPhotoInput = {
  index: number;
  kind: CatalogImageKind;
};

export type CatalogPhotoLink = {
  attachmentId: string;
  kind: CatalogImageKind;
  sortOrder: number;
};

export function resolveTurnPhotoLinks(
  attachments: readonly { id: string }[],
  photos: readonly CatalogPhotoInput[] | undefined,
): CatalogPhotoLink[] {
  if (photos === undefined || photos.length === 0) {
    return [];
  }
  const links: CatalogPhotoLink[] = [];
  const seen = new Set<string>();
  for (const [sortOrder, photo] of photos.entries()) {
    if (!Number.isInteger(photo.index) || photo.index < 0) {
      continue;
    }
    const attachment = attachments[photo.index];
    if (attachment === undefined || seen.has(attachment.id)) {
      continue;
    }
    seen.add(attachment.id);
    links.push({
      attachmentId: attachment.id,
      kind: photo.kind,
      sortOrder,
    });
  }
  return links;
}

export function toCatalogImageViews(
  rows: readonly { id: string; kind: CatalogImageKind }[],
): CatalogProductImageView[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    url: catalogImageUrl(row.id),
  }));
}

export function primaryCatalogImageUrl(images: readonly CatalogProductImageView[]): string | null {
  const front = images.find((image) => image.kind === "front");
  return front?.url ?? images[0]?.url ?? null;
}

export function withCatalogImages(
  product: Product,
  images: readonly CatalogProductImageView[],
): Product {
  if (images.length === 0) {
    return product;
  }
  return {
    ...product,
    imageUrl: primaryCatalogImageUrl(images) ?? product.imageUrl,
    images,
  };
}
