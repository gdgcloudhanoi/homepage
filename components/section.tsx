import { cn } from "@/lib/utils";

export function Section({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "border-t border-hairline px-6 py-12 first:border-t-0 lg:px-20 lg:py-16",
        className
      )}
      {...props}
    />
  );
}

export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2 className={cn("mb-4 font-bold text-ink", className)} {...props} />
  );
}
