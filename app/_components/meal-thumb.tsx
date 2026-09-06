import type { MealView } from "@/lib/meals";
import { cn } from "@/lib/utils";
import { CircleDashed } from "@gravity-ui/icons";

const MEAL_IMAGE_SRC: Partial<Record<MealView["label"], string>> = {
  breakfast: "/breakfast.png",
  dinner: "/dinner.png",
  lunch: "/lunch.png",
  snack: "/snacks.png",
};

export function MealThumb({
  alt,
  className,
  label,
}: {
  readonly alt: string;
  readonly className?: string;
  readonly label: MealView["label"];
}) {
  const src = MEAL_IMAGE_SRC[label];
  return (
    <span className={cn("flex size-14 shrink-0 items-center justify-center", className)}>
      {src ? (
        <img alt={alt} className="size-full object-contain" src={src} />
      ) : (
        <CircleDashed className="size-5" />
      )}
    </span>
  );
}
