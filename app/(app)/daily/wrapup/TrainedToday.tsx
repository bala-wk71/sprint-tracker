"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { QUICK_MINUTES, QUICK_SESSIONS } from "@/lib/health/daily";
import { announceXp } from "@/lib/xpToast";
import { logQuickSession, removeQuickSession } from "./actions";
import type { WrapupSession } from "./load";

const CHIP =
  "rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50";
const CHIP_OFF = "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground";
const CHIP_ON = "border-primary bg-primary/10 text-foreground";

/** One tap per session: what it was and roughly how long. Sets stay optional. */
export function TrainedToday({ date, sessions }: { date: string; sessions: WrapupSession[] }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<number>(45);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const log = (name: string, activity: (typeof QUICK_SESSIONS)[number]["activity"]) =>
    startTransition(async () => {
      setError(null);
      const result = await logQuickSession({ logDate: date, name, activity, minutes });
      if (!result.ok) return setError(result.error);
      announceXp(result.xp, `${name} logged`);
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      setError(null);
      const result = await removeQuickSession(id);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {sessions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {sessions.map((s) => (
            <li key={s.id} className={`${CHIP} ${CHIP_ON} flex items-center gap-1.5 py-1.5 pr-1.5`}>
              <span>
                {s.name}
                {s.minutes ? ` · ${s.minutes} min` : ""}
                {s.sets > 0 ? ` · ${s.sets} sets` : ""}
              </span>
              {s.sets === 0 ? (
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  disabled={pending}
                  aria-label={`Remove ${s.name}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <Link href="/health/train" className="px-1 text-xs text-primary hover:underline">
                  Open
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{sessions.length > 0 ? "Another session?" : "Trained today?"}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="How long">
          {QUICK_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              aria-pressed={minutes === m}
              className={`${CHIP} px-2.5 py-1 text-xs ${minutes === m ? CHIP_ON : CHIP_OFF}`}
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_SESSIONS.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => log(s.name, s.activity)}
              disabled={pending}
              className={`${CHIP} ${CHIP_OFF} inline-flex items-center gap-1`}
            >
              <Plus className="h-3.5 w-3.5" />
              {s.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Want the sets too?{" "}
          <Link href="/health/train" className="text-primary hover:underline">
            Log them on the Train page
          </Link>
          .
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
