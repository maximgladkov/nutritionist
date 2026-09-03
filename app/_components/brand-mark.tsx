import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  size = "sm",
}: {
  readonly className?: string;
  readonly size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "bg-accent flex shrink-0 items-center justify-center rounded-md",
        size === "md" ? "size-10 rounded-lg" : "size-6",
        className,
      )}
    >
      <span
        className={cn(
          "text-accent-foreground font-bold",
          size === "md" ? "text-lg" : "text-sm",
        )}
      >
        B
      </span>
    </div>
  );
}
