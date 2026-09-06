import { prisma } from "./prisma.ts";
import { loadCatalogImagesByBarcodes, primaryCatalogImageUrl } from "./catalog-product-images.ts";
import {
  applyFavorites,
  groupLoggedProducts,
  type ProductSegment,
  type UserProductView,
} from "./user-products.ts";

export async function listUserProducts(input: {
  segment: ProductSegment;
  userId: string;
}): Promise<UserProductView[]> {
  const meals = await prisma.meal.findMany({
    select: { id: true },
    where: { userId: input.userId },
  });
  const mealIds = meals.map((meal) => meal.id);
  const [items, favorites] = await Promise.all([
    mealIds.length === 0
      ? Promise.resolve([])
      : prisma.mealItem.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            amount: true,
            barcode: true,
            createdAt: true,
            energyKcal: true,
            imageUrl: true,
            name: true,
            unit: true,
          },
          where: { mealId: { in: mealIds } },
        }),
    prisma.productFavorite.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        barcode: true,
        createdAt: true,
        key: true,
        name: true,
      },
      where: { userId: input.userId },
    }),
  ]);
  const grouped = groupLoggedProducts(items);
  const barcodes = [
    ...new Set(
      [...grouped, ...favorites]
        .map((item) => item.barcode)
        .filter((barcode): barcode is string => Boolean(barcode && barcode.length > 0)),
    ),
  ];
  const imagesByBarcode = await loadCatalogImagesByBarcodes(barcodes);
  const withImages = grouped.map((product) => withCatalogProductImages(product, imagesByBarcode));
  return applyFavorites(withImages, favorites, input.segment).map((product) =>
    withCatalogProductImages(product, imagesByBarcode),
  );
}

export async function setProductFavorite(input: {
  barcode?: string | null;
  favorite: boolean;
  key: string;
  name: string;
  userId: string;
}): Promise<{ favorite: boolean; key: string }> {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new Error("Product key is required");
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("Product name is required");
  }
  if (input.favorite) {
    await prisma.productFavorite.upsert({
      where: { userId_key: { userId: input.userId, key } },
      create: {
        barcode: input.barcode?.trim() || null,
        key,
        name,
        userId: input.userId,
      },
      update: {
        barcode: input.barcode?.trim() || null,
        name,
      },
    });
    return { favorite: true, key };
  }
  await prisma.productFavorite.deleteMany({
    where: { userId: input.userId, key },
  });
  return { favorite: false, key };
}

function withCatalogProductImages(
  product: UserProductView,
  imagesByBarcode: Map<string, UserProductView["images"]>,
): UserProductView {
  if (!product.barcode) {
    return product;
  }
  const images = imagesByBarcode.get(product.barcode) ?? product.images;
  return {
    ...product,
    imageUrl: product.imageUrl ?? primaryCatalogImageUrl(images),
    images,
  };
}
