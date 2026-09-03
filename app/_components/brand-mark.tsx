import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  size = "sm",
}: {
  readonly className?: string;
  readonly size?: "sm" | "md";
}) {
  const px = size === "md" ? 40 : 24;
  return (
    <img
      alt="BTR.me"
      className={cn("shrink-0 rounded-md", size === "md" ? "size-10 rounded-lg" : "size-6", className)}
      height={px}
      src="/icon-192.png"
      width={px}
    />
  );
}
