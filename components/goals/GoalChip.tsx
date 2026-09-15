import Link from "next/link";
import { Target } from "lucide-react";

/** A small link from a piece of work to the goal it serves. */
export function GoalChip({ goalId, title }: { goalId: string; title: string }) {
  return (
    <Link
      href={`/goals/${goalId}`}
      title={`Helps: ${title}`}
      className="inline-flex max-w-[9rem] shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-foreground sm:max-w-[14rem]"
    >
      <Target className="h-3 w-3 shrink-0 text-primary" aria-hidden />
      <span className="truncate">{title}</span>
    </Link>
  );
}
