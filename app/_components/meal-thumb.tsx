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
    <span
      className={cn(
        "bg-default flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
    >
      {src ? (
        <img alt={alt} className="size-full object-cover" height={44} src={src} width={44} />
      ) : (
        <CircleDashed className="size-4" />
      )}
    </span>
  );
}
