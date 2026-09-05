export type ProductImagePreview = {
  imageUrl: string;
  name: string;
};

export function productImagePreviews(value: unknown): ProductImagePreview[] {
  const previews: ProductImagePreview[] = [];
  const seen = new Set<string>();
  walk(value, previews, seen);
  return previews;
}

export function looksLikeImageUrl(value: string, keyName?: number | string): boolean {
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }
  if (keyName === "imageUrl" || keyName === "image_url" || keyName === "image_small_url") {
    return true;
  }
  try {
    return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function walk(value: unknown, previews: ProductImagePreview[], seen: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, previews, seen);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";
  if (imageUrl.length > 0 && !seen.has(imageUrl)) {
    seen.add(imageUrl);
    const name = typeof record.name === "string" ? record.name.trim() : "";
    previews.push({ imageUrl, name: name.length > 0 ? name : "Product" });
  }
  for (const child of Object.values(record)) {
    walk(child, previews, seen);
  }
}
