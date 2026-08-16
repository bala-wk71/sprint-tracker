"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The cluster of controls on a section or task row.
 *
 * With a mouse the buttons stay out of the way until the row is hovered. A
 * touch screen has no hover, so on a phone those controls were invisible and
 * unreachable — and six of them will not fit beside a title at 375px anyway.
 * Below `sm` they therefore sit behind an always-visible toggle and open onto
 * their own full-width line, where they also get proper tap targets.
 */
export function RowActions({
  label,
  children,
}: {
  /** What the toggle reveals, e.g. "task actions" — used for the aria-label. */
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? `Hide ${label}` : `Show ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <div
        className={cn(
          // Mobile: its own line, wrapping, with 44px-tall targets.
          "w-full flex-wrap items-center justify-end gap-1 pb-1 [&_button]:h-11 [&_button]:min-w-11",
          open ? "flex" : "hidden",
          // sm and up: back to the inline, hover-revealed cluster.
          "sm:flex sm:w-auto sm:flex-nowrap sm:gap-0.5 sm:pb-0 sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover:opacity-100",
          "sm:[&_button]:h-8 sm:[&_button]:min-w-0"
        )}
      >
        {children}
      </div>
    </>
  );
}
