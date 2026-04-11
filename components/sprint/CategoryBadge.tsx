import { TASK_CATEGORIES, type TaskCategory } from "@/lib/constants";
import { CATEGORY_DOT_CLASSES } from "@/lib/icons";
import { cn } from "@/lib/utils";

const CATEGORY_CLASSES: Record<TaskCategory, string> = {
  strong_signal: "bg-strong-signal/15 text-strong-signal border-strong-signal/30",
  weak_signal: "bg-weak-signal/15 text-weak-signal border-weak-signal/30",
  strong_noise: "bg-strong-noise/15 text-strong-noise border-strong-noise/30",
  weak_noise: "bg-weak-noise/15 text-weak-noise border-weak-noise/30",
  personal: "bg-personal/15 text-personal border-personal/30",
};

export function CategoryBadge({
  category,
  className,
  showDot = true,
}: {
  category: TaskCategory;
  className?: string;
  showDot?: boolean;
}) {
  const meta = TASK_CATEGORIES[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        CATEGORY_CLASSES[category],
        className
      )}
    >
      {showDot && (
        <span
          aria-hidden
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            CATEGORY_DOT_CLASSES[category]
          )}
        />
      )}
      <span>{meta.label}</span>
    </span>
  );
}
