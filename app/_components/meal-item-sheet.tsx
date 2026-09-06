"use client";

import { FoodThumb } from "@/app/_components/food-thumb";
import { MEAL_LABELS } from "@/app/_components/i18n-labels";
import { MealKcal } from "@/app/_components/meal-kcal";
import { MealThumb } from "@/app/_components/meal-thumb";
import { deleteMealItemAction, updateMealItemAction } from "@/app/actions/meals";
import type { MealItemView, MealView } from "@/lib/meals";
import { PRODUCT_MEAL_LABELS } from "@/lib/user-products";
import { RadioButtonGroup, Sheet } from "@heroui-pro/react";
import { Button, Label, NumberField, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

function amountStep(unit: MealItemView["unit"]): number {
  return unit === "serving" ? 0.5 : 10;
}

function scaledKcal(item: MealItemView, amount: number): number | null {
  if (item.metrics.energyKcal === null || item.amount <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return (item.metrics.energyKcal * amount) / item.amount;
}

function destinationLabels(current: MealView["label"]): readonly MealView["label"][] {
  if (current === "other") {
    return [...PRODUCT_MEAL_LABELS, "other"];
  }
  return PRODUCT_MEAL_LABELS;
}

export function MealItemSheet({
  initData,
  item,
  label: currentLabel,
  onChanged,
  onClose,
}: {
  readonly initData?: string;
  readonly item: MealItemView | null;
  readonly label: MealView["label"] | null;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const [label, setLabel] = useState<MealView["label"]>("snack");
  const [amount, setAmount] = useState(100);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);

  useEffect(() => {
    if (!item || !currentLabel) {
      return;
    }
    setLabel(currentLabel);
    setAmount(item.amount);
    setPending(null);
  }, [currentLabel, item]);

  const step = item ? amountStep(item.unit) : 10;
  const kcal = item ? scaledKcal(item, amount) : null;
  const dirty =
    item !== null &&
    currentLabel !== null &&
    (amount !== item.amount || label !== currentLabel);
  const canSave =
    item !== null && dirty && Number.isFinite(amount) && amount > 0 && pending === null;
  const choices = currentLabel ? destinationLabels(currentLabel) : PRODUCT_MEAL_LABELS;

  return (
    <Sheet
      isOpen={item !== null}
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
              <Sheet.Heading className="flex min-w-0 items-center gap-3">
                <FoodThumb alt={item?.name ?? ""} src={item?.imageUrl} />
                <span className="min-w-0 truncate">{item?.name ?? ""}</span>
              </Sheet.Heading>
            </Sheet.Header>
            <Sheet.Body className="flex flex-col gap-5">
              <RadioButtonGroup
                className="grid w-full grid-cols-2"
                layout="grid"
                name="meal-label"
                value={label}
                variant="secondary"
                onChange={(value) => {
                  if (typeof value === "string" && choices.includes(value as MealView["label"])) {
                    setLabel(value as MealView["label"]);
                  }
                }}
              >
                <Label className="col-span-full">
                  <Trans>Move to</Trans>
                </Label>
                {choices.map((mealLabel) => {
                  const mealName = t(MEAL_LABELS[mealLabel]);
                  return (
                    <RadioButtonGroup.Item key={mealLabel} value={mealLabel}>
                      <RadioButtonGroup.ItemContent className="flex-row items-center gap-3">
                        <RadioButtonGroup.ItemIcon>
                          <MealThumb alt="" className="size-10" label={mealLabel} />
                        </RadioButtonGroup.ItemIcon>
                        <Label>{mealName}</Label>
                      </RadioButtonGroup.ItemContent>
                    </RadioButtonGroup.Item>
                  );
                })}
              </RadioButtonGroup>
              {item ? (
                <div className="relative w-full">
                  <NumberField
                    className="w-full"
                    formatOptions={{ maximumFractionDigits: 1, useGrouping: false }}
                    fullWidth
                    minValue={Math.min(step, item.amount)}
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
                    <Label className="pe-24">
                      <Trans>Size</Trans>
                      {` (${item.unit})`}
                    </Label>
                    <NumberField.Group className="w-full min-w-0">
                      <NumberField.DecrementButton />
                      <NumberField.Input className="min-w-0 text-center" />
                      <NumberField.IncrementButton />
                    </NumberField.Group>
                  </NumberField>
                  <div className="pointer-events-none absolute top-0 right-0 flex h-5 items-center">
                    <MealKcal compact value={kcal} />
                  </div>
                </div>
              ) : null}
            </Sheet.Body>
            <Sheet.Footer>
              <Button
                className="mr-auto"
                isDisabled={pending !== null}
                isPending={pending === "remove"}
                variant="danger-soft"
                onPress={() => {
                  if (!item) {
                    return;
                  }
                  setPending("remove");
                  void deleteMealItemAction({ initData, itemId: item.id }).then((result) => {
                    setPending(null);
                    if (!result.ok) {
                      toast.danger(result.error);
                      return;
                    }
                    toast.success(t`Removed.`);
                    onChanged();
                  });
                }}
              >
                <Trans>Remove</Trans>
              </Button>
              <Button
                isDisabled={!canSave}
                isPending={pending === "save"}
                onPress={() => {
                  if (!item || !currentLabel) {
                    return;
                  }
                  setPending("save");
                  void updateMealItemAction({
                    amount: amount !== item.amount ? amount : undefined,
                    initData,
                    itemId: item.id,
                    label: label !== currentLabel ? label : undefined,
                  }).then((result) => {
                    setPending(null);
                    if (!result.ok) {
                      toast.danger(result.error);
                      return;
                    }
                    if (label !== currentLabel) {
                      const mealName = t(MEAL_LABELS[label]);
                      toast.success(t`Moved to ${mealName}.`);
                    } else {
                      toast.success(t`Saved.`);
                    }
                    onChanged();
                  });
                }}
              >
                <Trans>Save</Trans>
              </Button>
            </Sheet.Footer>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}
