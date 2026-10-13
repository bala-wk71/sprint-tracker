"use client";

import { Palette } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TimerPill } from "@/components/timer/TimerPill";
import { ThemePicker } from "@/components/shared/ThemePicker";

const emptySubscribe = () => () => {};

export function Header() {
  // True after hydration only — avoids a theme flash without setState-in-effect.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [themeOpen, setThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!themeOpen) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setThemeOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThemeOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [themeOpen]);

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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm md:h-16 md:px-6">
      {/* Date text depends on the viewer's timezone, so render it
          client-only to avoid a hydration mismatch near midnight. */}
      <p className="text-sm font-medium text-muted-foreground">
        {mounted && (
          <>
            <span className="sm:hidden">{todayShort}</span>
            <span className="hidden sm:inline">{today}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2 sm:gap-4">
        <TimerPill />
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setThemeOpen((v) => !v)}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Change theme"
            aria-haspopup="true"
            aria-expanded={themeOpen}
          >
            <Palette className="h-4 w-4" />
          </button>
          {themeOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-popover p-2 shadow-xl">
              <ThemePicker compact onPick={() => setThemeOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
