"use client";

import { Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function Header() {
  const { theme, setTheme } = useTheme();
  // True after hydration only — avoids a theme flash without setState-in-effect.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const todayShort = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm md:px-6">
      {/* Spacer that reserves room for the mobile hamburger button */}
      <div className="w-10 md:hidden" />
      <p className="text-sm font-medium text-muted-foreground">
        <span className="sm:hidden">{todayShort}</span>
        <span className="hidden sm:inline">{today}</span>
      </p>
      <div className="flex items-center gap-4">
        {mounted && (() => {
          const cycle = { light: "dark", dark: "colourful", colourful: "light" } as const;
          const current = (theme as string) in cycle ? (theme as keyof typeof cycle) : "light";
          return (
            <button
              onClick={() => setTheme(cycle[current])}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Switch theme (current: ${current})`}
            >
              {current === "light" && <Moon className="h-4 w-4" />}
              {current === "dark" && <Palette className="h-4 w-4" />}
              {current === "colourful" && <Sun className="h-4 w-4" />}
            </button>
          );
        })()}
      </div>
    </header>
  );
}
