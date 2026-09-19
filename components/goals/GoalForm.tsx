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
  TRACK_TYPES,
  defaultCheckinDays,
  lengthInDays,
  targetDateFor,
  type GoalArea,
  type GoalHorizon,
  type TrackType,
} from "@/lib/goals/constants";
import { saveGoal } from "@/app/(app)/goals/actions";
import type { StreamOption } from "@/lib/planning/streams";
import { FIELD_HINT, FIELD_LABEL, INPUT, NumberFields, PillGroup, StepsEditor } from "./GoalFormParts";

export type EditableGoal = {
  id: string;
  title: string;
  why: string;
  area: GoalArea;
  horizon: GoalHorizon;
  startDate: string;
  targetDate: string;
  trackType: TrackType;
  startValue: number | null;
  targetValue: number | null;
  unit: string | null;
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
};

const HORIZON_OPTIONS = [
  ...GOAL_HORIZONS.map((h) => ({ value: h.value, label: h.label })),
  { value: "custom" as const, label: "Pick a date" },
];

const toNumber = (text: string) => (text.trim() === "" ? null : Number(text));

export function GoalForm({
  todayIso,
  parentOptions,
  activeCount,
  initialParentId = null,
  goal,
  streams = [],
  initialStreamId = null,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [why, setWhy] = useState(goal?.why ?? "");
  const initialStream = streams.find((s) => s.id === (goal ? goal.streamId : initialStreamId)) ?? null;
  const [area, setArea] = useState<GoalArea | null>(goal?.area ?? initialStream?.area ?? null);
  const [streamId, setStreamId] = useState(initialStream?.id ?? "");
  const [horizon, setHorizon] = useState<GoalHorizon>(goal?.horizon ?? "3m");
  const [customDate, setCustomDate] = useState(goal?.horizon === "custom" ? goal.targetDate : "");
  const [trackType, setTrackType] = useState<TrackType>(goal?.trackType ?? "steps");
  const [steps, setSteps] = useState<string[]>([""]);
  const [numbers, setNumbers] = useState({
    startValue: goal?.startValue?.toString() ?? "",
    targetValue: goal?.targetValue?.toString() ?? "",
    unit: goal?.unit ?? "",
  });
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
    if (!area) {
      setError("Pick a life area.");
      return;
    }
    const startValue = toNumber(numbers.startValue);
    const targetValue = toNumber(numbers.targetValue);
    if (trackType === "number" && (Number.isNaN(startValue) || Number.isNaN(targetValue))) {
      setError("Enter plain numbers for where you are and where you want to be.");
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
        trackType,
        startValue,
        targetValue,
        unit: numbers.unit,
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
      <div>
        <label htmlFor="goal_title" className={FIELD_LABEL}>
          What do you want to reach?
        </label>
        <input
          id="goal_title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Run a half marathon"
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
              </option>
            ))}
          </select>
          <p className={FIELD_HINT}>Which front of your life this belongs to. Its hours and progress roll up there.</p>
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

      <div className="space-y-3">
        <PillGroup
          label="How you'll track it"
          hint={TRACK_TYPES.find((t) => t.value === trackType)?.hint}
          value={trackType}
          options={TRACK_TYPES}
          onChange={setTrackType}
        />
        {trackType === "steps" && !goal && <StepsEditor steps={steps} onChange={setSteps} />}
        {trackType === "number" && (
          <NumberFields {...numbers} onChange={(patch) => setNumbers((n) => ({ ...n, ...patch }))} />
        )}
      </div>

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
          You already have {activeCount} active goals. Three to five tends to work best, but it&apos;s your call.
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
