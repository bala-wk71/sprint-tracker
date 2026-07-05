import {
  Anchor,
  Award,
  BadgeCheck,
  BookOpenCheck,
  Brain,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  CheckSquare,
  ClipboardList,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gem,
  Hourglass,
  ListChecks,
  Lock,
  Medal,
  Mountain,
  Radio,
  Repeat,
  Rocket,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  Timer,
  Trophy,
  Undo2,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/gamification";

const ICONS: Record<string, LucideIcon> = {
  Anchor,
  Award,
  BadgeCheck,
  BookOpenCheck,
  Brain,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  CheckSquare,
  ClipboardList,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gem,
  Hourglass,
  ListChecks,
  Medal,
  Mountain,
  Radio,
  Repeat,
  Rocket,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  Timer,
  Trophy,
  Undo2,
  Waves,
  Zap,
};

type Props = {
  unlockedIds: string[];
};

export function AchievementsPanel({ unlockedIds }: Props) {
  const unlocked = new Set(unlockedIds);
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-foreground">Achievements</h2>
        <span className="text-xs text-muted-foreground">
          {unlocked.size} of {ACHIEVEMENTS.length} unlocked
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ACHIEVEMENTS.map((a) => {
          const Icon = ICONS[a.icon] ?? Lock;
          const isUnlocked = unlocked.has(a.id);
          return (
            <div
              key={a.id}
              title={a.description}
              className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors ${
                isUnlocked
                  ? "border-primary/30 bg-primary/5"
                  : "border-dashed border-border opacity-50"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isUnlocked
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isUnlocked ? (
                  <Icon className="h-5 w-5" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {a.title}
                </p>
                <p className="mt-0.5 hidden text-[11px] leading-tight text-muted-foreground sm:block">
                  {a.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
