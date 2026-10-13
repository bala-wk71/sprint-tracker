"use client";

import Link from "next/link";
import { ArrowRight, Check, Flame, Moon, Shield, Sunrise, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LevelInfo, ShieldedStreak } from "@/lib/gamification";
import type { ThemeId } from "@/lib/themes";
import { useAppTheme } from "@/lib/hooks/useAppTheme";
import { formatMoney } from "@/lib/money/summary";
import type { TodayStatus } from "./GamificationHero";
import { JarvisBar } from "./JarvisBar";

export type WeekDay = {
  iso: string;
  /** One-letter weekday. */
  label: string;
  logged: boolean;
  isToday: boolean;
  future: boolean;
};

export type HomeMoney = {
  spent: number;
  left: number | null;
  pct: number | null;
  currency: string;
};

type Props = {
  /** Theme the server rendered for, so the first paint already matches. */
  serverTheme: ThemeId;
  name: string;
  level: LevelInfo;
  today: TodayStatus;
  streak: ShieldedStreak;
  week: WeekDay[];
  money: HomeMoney | null;
  badges: { unlocked: number; total: number };
  wagerOpen: boolean;
  /** The goals strip, rendered on the server. */
  goals: React.ReactNode;
};

/**
 * Home for the Jarvis, Retro, Pastel and Minimal themes: everything that
 * matters today on one screen, no scrolling on a phone. The long week view
 * is one tap away ("Full week view").
 */
export function CompactHome({
  serverTheme,
  name,
  level,
  today,
  streak,
  week,
  money,
  badges,
  wagerOpen,
  goals,
}: Props) {
  const { theme, vocab } = useAppTheme(serverTheme);
  const pct = Math.min(100, Math.round((level.progress / level.span) * 100));
  const steps = [
    { key: "checkin", label: vocab.checkin, icon: Sunrise, href: "/daily#morning", done: today.checkin },
    { key: "time", label: vocab.timeLog, icon: Timer, href: "/daily#time", done: today.timeLogged },
    { key: "wrapup", label: vocab.wrapup, icon: Moon, href: "/daily#evening", done: today.wrapup },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const loggedDays = week.filter((d) => d.logged).length;

  return (
    <div className="home mx-auto flex max-w-5xl flex-col gap-3 sm:gap-4">
      {/* Who and where you stand */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">
            {theme === "retro" || theme === "jarvis"
              ? vocab.greeting
              : theme === "minimal"
                ? "Today"
                : `${vocab.greeting}, ${name}`}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {doneCount === 3
              ? "All three steps done today."
              : `${doneCount} of 3 done today${streak.current > 0 ? ` · ${streak.current}-day streak` : ""}`}
          </p>
        </div>
        <div data-gamified className="w-32 shrink-0 text-right sm:w-48">
          <p className="truncate text-xs font-semibold text-primary">
            {vocab.level} {level.level} · {level.title}
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {level.progress}/{level.span} {vocab.xp}
          </p>
        </div>
      </div>

      {theme === "jarvis" && <JarvisBar />}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-[1.4fr_1fr]">
        {/* Today's three steps */}
        <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{vocab.steps}</h2>
            {next && (
              <Link
                href={next.href}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              >
                {vocab.start}
              </Link>
            )}
          </div>
          <ul className="divide-y divide-border">
            {steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="flex items-center gap-3 py-2.5 text-sm"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      s.done
                        ? "bg-progress-good/20 text-progress-good"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s.done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <s.icon className="h-4 w-4" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-medium",
                      s.done ? "text-muted-foreground line-through" : "text-foreground"
                    )}
                  >
                    {s.label}
                  </span>
                  {!s.done && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-1">
          {/* The week at a glance */}
          <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-foreground">{vocab.week}</h2>
            <div className="mt-2 flex justify-between gap-1">
              {week.map((d) => (
                <div key={d.iso} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={cn(
                      "h-5 w-full max-w-6 rounded-md",
                      d.logged
                        ? "bg-progress-good"
                        : d.future
                          ? "border border-dashed border-border"
                          : "bg-muted",
                      d.isToday && "ring-2 ring-primary ring-offset-1 ring-offset-card"
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{loggedDays}/7 days</span>
              <span data-gamified className="flex items-center gap-1">
                <Flame className="h-3.5 w-3.5" />
                {streak.current}
                {streak.shields > 0 && (
                  <>
                    <Shield className="ml-1 h-3.5 w-3.5" />
                    {streak.shields}
                  </>
                )}
              </span>
            </p>
          </section>

          {/* Money this month */}
          <Link
            href="/money"
            className="block rounded-xl border border-border bg-card p-3 sm:p-4"
          >
            <h2 className="text-sm font-semibold text-foreground">{vocab.money}</h2>
            {money ? (
              <>
                <p
                  className={cn(
                    "mt-2 truncate text-lg font-bold tabular-nums",
                    money.left !== null && money.left < 0
                      ? "text-progress-danger"
                      : "text-foreground"
                  )}
                >
                  {formatMoney(
                    money.left === null ? money.spent : Math.abs(money.left),
                    money.currency
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {money.left === null
                    ? "spent this month"
                    : money.left < 0
                      ? "over this month"
                      : vocab.budgetLeft}
                </p>
                {money.pct !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        money.left !== null && money.left < 0
                          ? "bg-progress-danger"
                          : money.pct > 80
                            ? "bg-progress-warning"
                            : "bg-progress-good"
                      )}
                      style={{ width: `${money.pct}%` }}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Nothing yet. Sync Cashew or add a transaction.
              </p>
            )}
          </Link>
        </div>
      </div>

      {goals}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <Link
          href="/dashboard?view=full"
          className="font-medium text-primary hover:underline"
        >
          Full week view
        </Link>
        <span className="flex items-center gap-3 text-muted-foreground">
          {wagerOpen && (
            <Link
              data-gamified
              href="/dashboard?view=full#wager"
              className="hover:text-foreground"
            >
              Wager open this week
            </Link>
          )}
          <Link
            data-gamified
            href="/dashboard?view=full#achievements"
            className="hover:text-foreground"
          >
            {badges.unlocked}/{badges.total} badges
          </Link>
        </span>
      </div>
    </div>
  );
}
