import { TASK_CATEGORIES, type TaskCategory } from "@/lib/constants";
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
  showEmoji = true,
}: {
  category: TaskCategory;
  className?: string;
  showEmoji?: boolean;
}) {
  const meta = TASK_CATEGORIES[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        CATEGORY_CLASSES[category],
        className
      )}
    >
      {showEmoji && <span aria-hidden>{meta.emoji}</span>}
      <span>{meta.label}</span>
    </span>
  );
}
