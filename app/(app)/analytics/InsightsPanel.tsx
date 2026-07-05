import {
  CalendarCheck,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Trophy,
  Zap,
};

export type Insight = {
  icon: keyof typeof ICONS;
  text: string;
  tone: "good" | "warn" | "neutral";
};

const TONE_CLASSES: Record<Insight["tone"], string> = {
  good: "bg-[hsl(var(--strong-signal))]/10 text-[hsl(var(--strong-signal))]",
  warn: "bg-[hsl(var(--weak-signal))]/10 text-[hsl(var(--weak-signal))]",
  neutral: "bg-primary/10 text-primary",
};

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-[hsl(var(--weak-signal))]" />
        <h2 className="text-lg font-semibold text-foreground">Insights</h2>
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Log a few more days and patterns will show up here.
        </p>
      ) : (
        <ul className="space-y-3">
          {insights.map((insight, i) => {
            const Icon = ICONS[insight.icon] ?? Lightbulb;
            return (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[insight.tone]}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p className="text-sm leading-relaxed text-foreground">
                  {insight.text}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
