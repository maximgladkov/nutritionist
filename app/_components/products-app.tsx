"use client";

import { MEAL_LABELS } from "@/app/_components/i18n-labels";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { formatAmount, formatKcal } from "@/app/_components/nutrition-format";
import { bootTelegramWebApp } from "@/app/_components/telegram-webapp-client";
import {
  getUserProductsAction,
  logProductAction,
  toggleProductFavoriteAction,
} from "@/app/actions/products";
import {
  PRODUCT_MEAL_LABELS,
  PRODUCT_SEGMENTS,
  type ProductMealLabel,
  type ProductSegment,
  type UserProductView,
} from "@/lib/user-products";
import { CircleDashed, Cup, Moon, ShoppingBag, Star, StarFill, Sun } from "@gravity-ui/icons";
import { EmptyState, RadioButtonGroup, Segment, Sheet } from "@heroui-pro/react";
import {
  Button,
  Label,
  NumberField,
  Spinner,
  toast,
  Tooltip,
  Typography,
} from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

type ProductsSWRKey = readonly ["user-products", ProductSegment, string];

const MEAL_ICONS = {
  breakfast: Cup,
  dinner: Moon,
  lunch: Sun,
  snack: CircleDashed,
} as const;

async function fetchProducts([, segment, initData]: ProductsSWRKey): Promise<readonly UserProductView[]> {
  const result = await getUserProductsAction({
    initData: initData || undefined,
    segment,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function defaultMealLabel(now = new Date()): ProductMealLabel {
  const hour = now.getHours();
  if (hour < 5 || hour >= 21) {
    return "snack";
  }
  if (hour < 11) {
    return "breakfast";
  }
  if (hour < 16) {
    return "lunch";
  }
  return "dinner";
}

function amountStep(unit: UserProductView["unit"]): number {
  return unit === "serving" ? 0.5 : 10;
}

function scaledKcal(product: UserProductView, amount: number): number | null {
  if (product.energyKcal === null || product.amount <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return (product.energyKcal * amount) / product.amount;
}

export function ProductsApp({
  compact = false,
  embed = false,
}: {
  readonly compact?: boolean;
  readonly embed?: boolean;
}) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  const { mutate: mutateCache } = useSWRConfig();
  const [initData, setInitData] = useState<string | null>(embed ? null : "");
  const [segment, setSegment] = useState<ProductSegment>("recent");
  const [selected, setSelected] = useState<UserProductView | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!embed) {
      return;
    }
    return bootTelegramWebApp((value) => {
      setInitData(value);
    });
  }, [embed]);

  const readyInit = embed ? initData : "";
  const productsKey: ProductsSWRKey | null =
    readyInit != null ? ["user-products", segment, readyInit] : null;
  const { data, error, isLoading, mutate } = useSWR(productsKey, fetchProducts, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  const refreshNutrition = useCallback(() => {
    void mutateCache(
      (key) => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("nutrition-"),
    );
  }, [mutateCache]);

  const telegramInit = initData || undefined;

  const onToggleFavorite = useCallback(
    async (product: UserProductView) => {
      setPendingKey(product.key);
      const result = await toggleProductFavoriteAction({
        barcode: product.barcode,
        favorite: !product.favorite,
        initData: telegramInit,
        key: product.key,
        name: product.name,
      });
      setPendingKey(null);
      if (!result.ok) {
        toast.danger(result.error);
        return;
      }
      await mutate();
    },
    [mutate, telegramInit],
  );

  const onLogged = useCallback(async () => {
    setSelected(null);
    await mutate();
    refreshNutrition();
  }, [mutate, refreshNutrition]);

  const errorMessage = error instanceof Error ? error.message : error ? t`Could not load products.` : null;
  const products = data ?? [];

  return (
    <div
      className={
        embed
          ? "mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-3"
          : compact
            ? "flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto px-3 py-3"
            : "mx-auto flex w-full max-w-lg flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8"
      }
    >
      {embed ? null : (
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-xl font-semibold">
            <Trans>Products</Trans>
          </h1>
          <p className="text-muted text-sm">
            <Trans>Foods you have logged, ready to add again.</Trans>
          </p>
        </div>
      )}
      <Segment
        aria-label={t`Product lists`}
        className="w-full"
        key={locale}
        selectedKey={segment}
        onSelectionChange={(key) => {
          if (typeof key === "string" && PRODUCT_SEGMENTS.includes(key as ProductSegment)) {
            setSegment(key as ProductSegment);
          }
        }}
      >
        <Segment.Item id="recent">
          <Trans>Recent</Trans>
        </Segment.Item>
        <Segment.Item id="favorites">
          <Trans>Favorites</Trans>
        </Segment.Item>
        <Segment.Item id="all">
          <Trans>All</Trans>
        </Segment.Item>
      </Segment>
      {errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}
      {isLoading && !data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : null}
      {!isLoading && products.length === 0 && !errorMessage ? (
        <EmptyState className="bg-surface-secondary rounded-2xl">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              {segment === "favorites" ? (
                <Star className="size-5" />
              ) : (
                <ShoppingBag className="size-5" />
              )}
            </EmptyState.Media>
            <EmptyState.Title>
              {segment === "favorites" ? <Trans>No favorites yet</Trans> : <Trans>No products yet</Trans>}
            </EmptyState.Title>
            <EmptyState.Description>
              {segment === "favorites" ? (
                <Trans>Star foods you eat often so they show up here.</Trans>
              ) : (
                <Trans>Log a meal in chat and it will appear here for one-tap adding.</Trans>
              )}
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      ) : null}
      {products.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {products.map((product) => (
            <li className="flex items-center gap-1" key={product.key}>
              <Tooltip delay={0}>
                <Button
                  aria-label={product.favorite ? t`Remove from favorites` : t`Add to favorites`}
                  isIconOnly
                  isPending={pendingKey === product.key}
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    void onToggleFavorite(product);
                  }}
                >
                  {product.favorite ? (
                    <StarFill className="text-accent size-4" />
                  ) : (
                    <Star className="size-4" />
                  )}
                </Button>
                <Tooltip.Content>
                  {product.favorite ? <Trans>Remove from favorites</Trans> : <Trans>Add to favorites</Trans>}
                </Tooltip.Content>
              </Tooltip>
              <button
                className="hover:bg-surface-secondary flex min-w-0 flex-1 cursor-[var(--cursor-interactive)] items-center gap-3 rounded-2xl px-3 py-3 text-left"
                type="button"
                onClick={() => {
                  setSelected(product);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-foreground truncate text-sm">{product.name}</span>
                  <span className="text-muted text-xs tabular-nums">
                    {formatAmount(product.amount, product.unit)}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <Typography className="tabular-nums leading-none" type="body-sm" weight="semibold">
                    {formatKcal(product.energyKcal)}
                  </Typography>
                  {product.energyKcal !== null ? (
                    <Typography className="leading-none" color="muted" type="body-xs">
                      kcal
                    </Typography>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <AddProductSheet
        initData={telegramInit}
        product={selected}
        onClose={() => {
          setSelected(null);
        }}
        onLogged={() => {
          void onLogged();
        }}
      />
    </div>
  );
}

function AddProductSheet({
  initData,
  onClose,
  onLogged,
  product,
}: {
  readonly initData?: string;
  readonly onClose: () => void;
  readonly onLogged: () => void;
  readonly product: UserProductView | null;
}) {
  const { t } = useLingui();
  const [label, setLabel] = useState<ProductMealLabel>(defaultMealLabel);
  const [amount, setAmount] = useState<number>(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) {
      return;
    }
    setLabel(defaultMealLabel());
    setAmount(product.amount);
  }, [product]);

  const kcal = product ? scaledKcal(product, amount) : null;
  const step = product ? amountStep(product.unit) : 10;
  const canSubmit = product !== null && Number.isFinite(amount) && amount > 0 && !saving;

  return (
    <Sheet
      isOpen={product !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Sheet.Backdrop>
        <Sheet.Content className="mx-auto max-h-[95vh] max-w-[420px]">
          <Sheet.Dialog>
            <Sheet.Handle />
            <Sheet.CloseTrigger />
            <Sheet.Header>
              <Sheet.Heading className="min-w-0 truncate">{product?.name ?? ""}</Sheet.Heading>
            </Sheet.Header>
            <Sheet.Body className="flex flex-col gap-5">
              <RadioButtonGroup
                className="grid w-full grid-cols-2"
                layout="grid"
                name="meal-label"
                value={label}
                variant="secondary"
                onChange={(value) => {
                  if (typeof value === "string" && PRODUCT_MEAL_LABELS.includes(value as ProductMealLabel)) {
                    setLabel(value as ProductMealLabel);
                  }
                }}
              >
                <Label className="col-span-full">
                  <Trans>Add to</Trans>
                </Label>
                {PRODUCT_MEAL_LABELS.map((mealLabel) => {
                  const Icon = MEAL_ICONS[mealLabel];
                  return (
                    <RadioButtonGroup.Item key={mealLabel} value={mealLabel}>
                      <RadioButtonGroup.ItemContent className="flex-row items-center gap-3">
                        <RadioButtonGroup.ItemIcon>
                          <Icon className="size-4" />
                        </RadioButtonGroup.ItemIcon>
                        <Label>{t(MEAL_LABELS[mealLabel])}</Label>
                      </RadioButtonGroup.ItemContent>
                    </RadioButtonGroup.Item>
                  );
                })}
              </RadioButtonGroup>
              {product ? (
                <NumberField
                  formatOptions={{ maximumFractionDigits: 1, useGrouping: false }}
                  minValue={step}
                  name="amount"
                  step={step}
                  value={amount}
                  variant="secondary"
                  onChange={(value) => {
                    if (value !== undefined && !Number.isNaN(value)) {
                      setAmount(value);
                    }
                  }}
                >
                  <Label>
                    <Trans>Size</Trans>
                    {` (${product.unit})`}
                  </Label>
                  <NumberField.Group className="w-full min-w-0">
                    <NumberField.DecrementButton />
                    <NumberField.Input className="min-w-0 text-center" />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>
              ) : null}
              {kcal !== null ? (
                <p className="text-muted text-sm tabular-nums">
                  {formatKcal(kcal)} kcal
                </p>
              ) : null}
            </Sheet.Body>
            <Sheet.Footer>
              <Button variant="secondary" onPress={onClose}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                isDisabled={!canSubmit}
                isPending={saving}
                onPress={() => {
                  if (!product) {
                    return;
                  }
                  setSaving(true);
                  void logProductAction({
                    amount,
                    barcode: product.barcode,
                    initData,
                    label,
                    name: product.name,
                    unit: product.unit,
                  }).then((result) => {
                    setSaving(false);
                    if (!result.ok) {
                      toast.danger(result.error);
                      return;
                    }
                    const mealName = t(MEAL_LABELS[label]);
                    toast.success(t`Added to ${mealName}.`);
                    onLogged();
                  });
                }}
              >
                <Trans>Add</Trans>
              </Button>
            </Sheet.Footer>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}
