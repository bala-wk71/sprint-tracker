"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, ChevronsUp, Info, TrendingDown, X, Zap } from "lucide-react";
import { useAppTheme } from "@/lib/hooks/useAppTheme";
import {
  XP_TOAST_EVENT,
  type XpToastInput,
  type XpToastKind,
} from "@/lib/xpToast";

type Toast = XpToastInput & { id: number };

const LEVEL_KEY = "sprint-tracker:last-level";

const ICONS = {
  gain: Zap,
  loss: TrendingDown,
  badge: Award,
  level: ChevronsUp,
  info: Info,
} as const;

// How long each kind stays up. Bad news and big news get longer to be read.
const LIFETIME: Record<XpToastKind, number> = {
  gain: 3800,
  loss: 7000,
  badge: 7000,
  level: 8000,
  info: 9000,
};

/**
 * Draws every XP popup. Mounted once for the whole app, so a popup survives
 * moving between pages and looks the same wherever the XP was earned.
 */
export function XpToaster({
  level,
  levelTitle,
  levelProgressPct,
}: {
  level: number;
  levelTitle: string;
  levelProgressPct: number;
}) {
  const router = useRouter();
  const { theme, vocab } = useAppTheme();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (input: XpToastInput) => {
      const id = nextId.current++;
      // Newest on top, never more than three on screen.
      setToasts((prev) => [{ ...input, id }, ...prev].slice(0, 3));
      // Minimal keeps every popup to a short, quiet line.
      const life = theme === "minimal" ? 3000 : LIFETIME[input.kind];
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), life)
      );
    },
    [dismiss, theme]
  );

  useEffect(() => {
    const onToast = (e: Event) => {
      const input = (e as CustomEvent<XpToastInput>).detail;
      if (!input) return;
      push(input);
      // Pull the new total so the level bar (and a level-up) shows at once.
      if (input.kind === "gain") router.refresh();
    };
    window.addEventListener(XP_TOAST_EVENT, onToast);
    return () => window.removeEventListener(XP_TOAST_EVENT, onToast);
  }, [push, router]);

  // A level-up is noticed by comparing the level the server just rendered
  // with the last one this browser saw.
  useEffect(() => {
    let last: number | null = null;
    try {
      const raw = window.localStorage.getItem(LEVEL_KEY);
      last = raw === null ? null : Number(raw);
      window.localStorage.setItem(LEVEL_KEY, String(level));
    } catch {
      return;
    }
    if (last !== null && Number.isFinite(last) && level > last) {
      // Deferred so the popup is not created during the effect itself.
      const t = setTimeout(
        () => push({ kind: "level", title: vocab.levelUp(level, levelTitle) }),
        0
      );
      return () => clearTimeout(t);
    }
    // Only a change of level should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="xpt-stack pointer-events-none fixed inset-x-0 top-[4.25rem] z-[60] flex flex-col items-center gap-2 px-3 md:inset-x-auto md:right-6 md:top-20 md:items-end md:px-0"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        const headline =
          t.title ??
          (t.kind === "gain"
            ? vocab.gain(t.amount ?? 0)
            : t.kind === "loss"
              ? vocab.loss(t.amount ?? 0)
              : t.kind === "badge"
                ? vocab.badge
                : "");
        const detail =
          t.detail ?? (t.kind === "loss" ? vocab.lossDetail : undefined);
        return (
          <div
            key={t.id}
            role="status"
            data-kind={t.kind}
            className="xpt pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 pr-9 shadow-xl"
          >
            {t.art ? (
              // user-supplied local file; a plain img falls back cleanly
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.art}
                alt=""
                aria-hidden
                className="xpt-art h-16 w-16 shrink-0 rounded-lg object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="xpt-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="xpt-title text-base font-bold leading-tight">
                {headline}
              </p>
              {detail && (
                <p className="xpt-detail mt-0.5 text-xs text-muted-foreground">
                  {detail}
                </p>
              )}
              {(t.kind === "gain" || t.kind === "level") && (
                <div
                  className="xpt-bar mt-1.5 flex items-center gap-2"
                  aria-hidden
                >
                  <span className="xpt-track h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="xpt-fill block h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${levelProgressPct}%` }}
                    />
                  </span>
                  <span className="xpt-lv text-[10px] font-semibold text-muted-foreground">
                    {vocab.level} {level}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="xpt-close absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <span
              aria-hidden
              className="xpt-life absolute inset-x-0 bottom-0 h-0.5 origin-left"
              style={{
                animationDuration: `${theme === "minimal" ? 3000 : LIFETIME[t.kind]}ms`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
