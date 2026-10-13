"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES } from "@/lib/themes";
import { useAppTheme } from "@/lib/hooks/useAppTheme";

/**
 * The six themes as tappable swatches. `compact` is the header menu version;
 * the full version (Settings) also shows what each theme is for.
 */
export function ThemePicker({
  compact = false,
  onPick,
}: {
  compact?: boolean;
  onPick?: () => void;
}) {
  const { theme, mounted, setTheme } = useAppTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"
      )}
    >
      {THEMES.map((t) => {
        const active = mounted && theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              setTheme(t.id);
              onPick?.();
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg border text-left transition-colors",
              compact ? "px-2 py-1.5" : "flex-col items-stretch p-3",
              active
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-accent"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex shrink-0 overflow-hidden rounded-md border border-black/10",
                compact ? "h-7 w-10" : "h-14 w-full"
              )}
              style={{ background: t.swatch[0] }}
            >
              <span className="m-auto flex w-3/4 items-end gap-0.5">
                <span
                  className="h-3 flex-1"
                  style={{ background: t.swatch[1] }}
                />
                <span
                  className="h-4 flex-1"
                  style={{ background: t.swatch[2] }}
                />
                <span
                  className="h-2 flex-1"
                  style={{ background: t.swatch[3] }}
                />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {t.name}
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              {!compact && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t.blurb}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
