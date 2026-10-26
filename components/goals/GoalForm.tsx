"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTIVE_GOAL_SOFT_LIMIT,
  BIG_GOAL_DAYS,
  CHECKIN_OPTIONS,
  GOAL_AREAS,
  GOAL_HORIZONS,
  defaultCheckinDays,
  goalTypeLabel,
  lengthInDays,
  targetDateFor,
  type GoalArea,
  type GoalHorizon,
  type GoalType,
  type TrackType,
} from "@/lib/goals/constants";
import { saveGoal } from "@/app/(app)/goals/actions";
import type { MeasureSource } from "@/lib/planning/constants";
import type { StreamOption } from "@/lib/planning/streams";
import { FIELD_HINT, FIELD_LABEL, INPUT, PillGroup, StepsEditor } from "./GoalFormParts";
import {
  EMPTY_HABIT,
  EMPTY_TARGET,
  GoalTypePicker,
  HabitFields,
  TargetFields,
  readHabitDraft,
  readTargetDraft,
  type HabitDraft,
  type LatestReading,
  type TargetDraft,
} from "./GoalTypeFields";

export type EditableGoal = {
  id: string;
  title: string;
  why: string;
  area: GoalArea;
  horizon: GoalHorizon;
  startDate: string;
  targetDate: string;
  trackType: TrackType;
  /** A Habit's weekly count, edited here; a Target's number is edited on the goal page. */
  habit: HabitDraft | null;
  parentId: string | null;
  streamId: string | null;
  isPrivate: boolean;
  checkinEveryDays: number;
};

type Props = {
  todayIso: string;
  parentOptions: { id: string; title: string }[];
  activeCount: number;
  initialParentId?: string | null;
  goal?: EditableGoal;
  streams?: StreamOption[];
  initialStreamId?: string | null;
  /** The newest Health readings, so a Target on weight starts from the scale. */
  latest?: Partial<Record<MeasureSource, LatestReading>>;
};

const HORIZON_OPTIONS = [
  ...GOAL_HORIZONS.map((h) => ({ value: h.value, label: h.label })),
  { value: "custom" as const, label: "Pick a date" },
];

const TITLE_PLACEHOLDER: Record<GoalType, string> = {
  number: "87–88 kg by 31 Dec",
  habit: "Strength train 4 times a week",
  steps: "Protect the family",
};

export function GoalForm({
  todayIso,
  parentOptions,
  activeCount,
  initialParentId = null,
  goal,
  streams = [],
  initialStreamId = null,
  latest = {},
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [why, setWhy] = useState(goal?.why ?? "");
  const initialStream = streams.find((s) => s.id === (goal ? goal.streamId : initialStreamId)) ?? null;
  const [area, setArea] = useState<GoalArea | null>(goal?.area ?? initialStream?.area ?? null);
  const [streamId, setStreamId] = useState(initialStream?.id ?? "");
  const [horizon, setHorizon] = useState<GoalHorizon>(goal?.horizon ?? "3m");
  const [customDate, setCustomDate] = useState(goal?.horizon === "custom" ? goal.targetDate : "");
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [steps, setSteps] = useState<string[]>([""]);
  const [target, setTarget] = useState<TargetDraft>(() => {
    const weight = latest["body.weight_kg"];
    return weight ? { ...EMPTY_TARGET, start: String(weight.value) } : EMPTY_TARGET;
  });
  const [habit, setHabit] = useState<HabitDraft>(goal?.habit ?? EMPTY_HABIT);
  const kind: TrackType | null = goal ? goal.trackType : goalType;
  const [parentId, setParentId] = useState(goal?.parentId ?? initialParentId ?? "");
  const [isPrivate, setIsPrivate] = useState(goal?.isPrivate ?? false);
  // Follows the goal's length until the user picks a rhythm themselves.
  const [checkinChoice, setCheckinChoice] = useState<number | null>(goal?.checkinEveryDays ?? null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const startIso = goal?.startDate ?? todayIso;
  const targetIso = horizon === "custom" ? customDate || null : targetDateFor(horizon, startIso);
  const length = targetIso ? lengthInDays(startIso, targetIso) : null;
  const checkinDays = checkinChoice ?? (length ? defaultCheckinDays(length) : 7);
  const checkinOptions = CHECKIN_OPTIONS.some((o) => o.days === checkinDays)
    ? CHECKIN_OPTIONS
    : [...CHECKIN_OPTIONS, { days: checkinDays, label: `Every ${checkinDays} days` }];

  const submit = () => {
    if (!kind) {
      setError("Pick what kind of goal it is.");
      return;
    }
    if (!area) {
      setError("Pick a life area.");
      return;
    }
    const targetInput = !goal && kind === "number" ? readTargetDraft(target) : null;
    if (typeof targetInput === "string") {
      setError(targetInput);
      return;
    }
    const habitInput = kind === "habit" ? readHabitDraft(habit) : null;
    if (typeof habitInput === "string") {
      setError(habitInput);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveGoal({
        id: goal?.id,
        title,
        why,
        area,
        horizon,
        customTargetDate: horizon === "custom" ? customDate || null : null,
        trackType: kind,
        target: targetInput,
        habit: habitInput,
        steps: goal ? [] : steps,
        parentId: parentId || null,
        streamId: streams.length ? streamId || null : undefined,
        isPrivate,
        checkinEveryDays: checkinDays,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/goals/${result.data.id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {goal ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{goalTypeLabel(goal.trackType)}</span>
          {goal.trackType === "number" && ". Change the number and its checkpoints with Edit path on the goal page."}
          {goal.trackType === "steps" && ". Add, rename and tick milestones on the goal page."}
        </p>
      ) : (
        <GoalTypePicker value={goalType} onChange={setGoalType} />
      )}

      <div>
        <label htmlFor="goal_title" className={FIELD_LABEL}>
          What do you want to reach?
        </label>
        <input
          id="goal_title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind && kind !== "feeling" ? TITLE_PLACEHOLDER[kind] : "Run a half marathon"}
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="goal_why" className={FIELD_LABEL}>
          Why it matters
        </label>
        <textarea
          id="goal_why"
          value={why}
          maxLength={500}
          rows={2}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="One or two lines, in your own words."
          className={cn(INPUT, "h-auto py-2")}
        />
        <p className={FIELD_HINT}>The coach reads this to keep its advice personal.</p>
      </div>

      {streams.length > 0 && (
        <div>
          <label htmlFor="goal_stream" className={FIELD_LABEL}>
            Stream
          </label>
          <select
            id="goal_stream"
            value={streamId}
            onChange={(e) => {
              setStreamId(e.target.value);
              const picked = streams.find((s) => s.id === e.target.value);
              if (picked) setArea(picked.area);
            }}
            className={INPUT}
          >
            <option value="">No stream</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.focus === "maintain" ? " (maintain)" : ""}
              </option>
            ))}
          </select>
          <p className={FIELD_HINT}>
            Which front of your life this belongs to. Its hours and progress roll up there. Goals ending within a year
            go in a push stream.
          </p>
        </div>
      )}

      <PillGroup label="Life area" value={area} options={GOAL_AREAS} onChange={setArea} />

      <div className="space-y-2">
        <PillGroup label="How long" value={horizon} options={HORIZON_OPTIONS} onChange={setHorizon} />
        {horizon === "custom" && (
          <div className="max-w-xs">
            <label htmlFor="goal_custom_date" className="sr-only">
              End date
            </label>
            <input
              id="goal_custom_date"
              type="date"
              min={startIso}
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className={INPUT}
            />
          </div>
        )}
        {targetIso && (
          <p className="text-xs text-muted-foreground">
            Ends {format(new Date(`${targetIso}T00:00:00`), "EEE d MMM yyyy")}
          </p>
        )}
        {length !== null && length > BIG_GOAL_DAYS && !goal && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Big goals work better with a smaller first step. After saving, add a
            goal for the next three months underneath this one.
          </p>
        )}
      </div>

      {!goal && kind === "number" && (
        <TargetFields draft={target} onChange={(patch) => setTarget((t) => ({ ...t, ...patch }))} latest={latest} todayIso={todayIso} />
      )}
      {kind === "habit" && <HabitFields draft={habit} onChange={(patch) => setHabit((h) => ({ ...h, ...patch }))} />}
      {!goal && kind === "steps" && <StepsEditor steps={steps} onChange={setSteps} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="goal_parent" className={FIELD_LABEL}>
            Part of a bigger goal
          </label>
          <select
            id="goal_parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={INPUT}
          >
            <option value="">None</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="goal_checkin" className={FIELD_LABEL}>
            Check-in reminder
          </label>
          <select
            id="goal_checkin"
            value={checkinDays}
            onChange={(e) => setCheckinChoice(Number(e.target.value))}
            className={INPUT}
          >
            {checkinOptions.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className={FIELD_LABEL}>Who can see this goal</legend>
        <div role="radiogroup" aria-label="Who can see this goal" className="inline-flex gap-0.5 rounded-lg border border-border bg-background p-0.5 text-sm">
          {[
            { value: false, label: "Me and my reviewers", icon: Users },
            { value: true, label: "Only me", icon: Lock },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={isPrivate === o.value}
              onClick={() => setIsPrivate(o.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                isPrivate === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <o.icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          ))}
        </div>
        <p className={FIELD_HINT}>Check-ins on this goal follow the same setting.</p>
      </fieldset>

      {!goal && activeCount >= ACTIVE_GOAL_SOFT_LIMIT && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {`You already have ${activeCount} active goals. Three to five tends to work best, but it's your call.`}
        </p>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : goal ? "Save changes" : "Create goal"}
        </button>
        <Link href={goal ? `/goals/${goal.id}` : "/goals"} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </div>
  );
}
