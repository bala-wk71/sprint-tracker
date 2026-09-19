// A plan draft: what the roadmap importer or the AI planner proposes, before
// the user reviews and saves it. Client-safe; the same shape is edited on the
// review screen and committed by savePlanDraft.

import { z } from "zod";
import { GOAL_AREA_VALUES } from "@/lib/goals/constants";
import { MEASURE_SOURCES } from "./constants";

const AREAS = GOAL_AREA_VALUES;
const LEVELS = ["destination", "year", "quarter", "project"] as const;
const SOURCES = MEASURE_SOURCES.map((s) => s.value) as [string, ...string[]];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// What Gemini must return (OpenAPI subset). Zod below is the real check.

const nullable = (schema: Record<string, unknown>) => ({ ...schema, nullable: true });

const CHECKPOINT_SCHEMA = {
  type: "object",
  properties: {
    date: { type: "string", description: "YYYY-MM-DD" },
    label: nullable({ type: "string" }),
    min: nullable({ type: "number" }),
    max: nullable({ type: "number" }),
    relative: { type: "boolean" },
    holdUntil: nullable({ type: "string", description: "YYYY-MM-DD" }),
  },
  required: ["date", "min", "max", "relative"],
};

const MEASURE_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    kind: { type: "string", enum: ["number", "ladder"] },
    unit: nullable({ type: "string" }),
    direction: { type: "string", enum: ["down", "up", "band"] },
    interpolate: { type: "string", enum: ["linear", "compound", "step"] },
    source: { type: "string", enum: SOURCES },
    cadence: { type: "string", enum: ["weekly", "monthly", "quarterly"] },
    baselineValue: nullable({ type: "number" }),
    baselineOn: nullable({ type: "string" }),
    loanEmi: nullable({ type: "number" }),
    loanLastEmiOn: nullable({ type: "string" }),
    levels: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, proof: { type: "string" } }, required: ["title"] },
    },
    checkpoints: { type: "array", items: CHECKPOINT_SCHEMA },
  },
  required: ["label", "kind", "direction", "interpolate", "source", "cadence", "checkpoints"],
};

const LEVER_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    source: { type: "string", enum: ["tick", "workouts", "linked_hours"] },
    period: { type: "string", enum: ["week", "month"] },
    target: { type: "number" },
    floor: nullable({ type: "number" }),
  },
  required: ["title", "source", "period", "target"],
};

export const PLAN_DRAFT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    streams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          area: { type: "string", enum: [...AREAS] },
          weeklyHours: nullable({ type: "number" }),
        },
        required: ["key", "name", "area"],
      },
    },
    goals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          streamKey: nullable({ type: "string" }),
          parentKey: nullable({ type: "string" }),
          title: { type: "string" },
          why: { type: "string" },
          area: { type: "string", enum: [...AREAS] },
          level: nullable({ type: "string", enum: [...LEVELS] }),
          startDate: nullable({ type: "string" }),
          targetDate: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          measures: { type: "array", items: MEASURE_SCHEMA },
          levers: { type: "array", items: LEVER_SCHEMA },
        },
        required: ["key", "title", "area", "targetDate", "steps", "measures", "levers"],
      },
    },
    notes: { type: "string", description: "Markdown: everything kept for reference but not tracked" },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["streams", "goals", "notes", "questions"],
};

// ---------------------------------------------------------------------------
// Zod: forgiving on the model's rough edges, so one odd field costs that
// field, not the whole draft.

const isoOrNull = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && ISO.test(v) ? v : null))
  .catch(null);
const num = z.number().finite().nullable().optional().transform((v) => v ?? null).catch(null);

const checkpointSchema = z.object({
  date: z.string().regex(ISO),
  label: z.string().trim().max(40).nullable().optional().transform((v) => v || null).catch(null),
  min: num,
  max: num,
  relative: z.boolean().catch(false),
  holdUntil: isoOrNull,
});

const measureSchema = z.object({
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["number", "ladder"]).catch("number"),
  unit: z.string().trim().max(20).nullable().optional().transform((v) => v || null).catch(null),
  direction: z.enum(["down", "up", "band"]).catch("up"),
  interpolate: z.enum(["linear", "compound", "step"]).catch("linear"),
  source: z.enum(SOURCES).catch("manual"),
  cadence: z.enum(["weekly", "monthly", "quarterly"]).catch("monthly"),
  baselineValue: num,
  baselineOn: isoOrNull,
  loanEmi: num,
  loanLastEmiOn: isoOrNull,
  levels: z
    .array(z.object({ title: z.string().trim().max(120), proof: z.string().trim().max(200).optional().catch("") }))
    .max(12)
    .optional()
    .catch([])
    .transform((v) => (v ?? []).map((l) => ({ title: l.title, proof: l.proof ?? "" }))),
  checkpoints: z.array(z.unknown()).max(60).catch([]).transform((items) =>
    items.flatMap((c) => {
      const parsed = checkpointSchema.safeParse(c);
      return parsed.success ? [parsed.data] : [];
    })
  ),
});

const leverSchema = z.object({
  title: z.string().trim().min(1).max(80),
  source: z.enum(["tick", "workouts", "linked_hours"]).catch("tick"),
  period: z.enum(["week", "month"]).catch("week"),
  target: z.number().positive().max(999),
  floor: num,
});

const listOf = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .array(z.unknown())
    .max(max)
    .catch([])
    .transform((items) =>
      items.flatMap((i) => {
        const parsed = item.safeParse(i);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      })
    );

const goalSchema = z.object({
  key: z.string().trim().min(1).max(60),
  streamKey: z.string().nullable().optional().transform((v) => v || null).catch(null),
  parentKey: z.string().nullable().optional().transform((v) => v || null).catch(null),
  title: z.string().trim().min(1).max(120),
  why: z.string().trim().max(500).optional().catch("").transform((v) => v ?? ""),
  area: z.enum(AREAS).catch("self"),
  level: z.enum(LEVELS).nullable().optional().transform((v) => v ?? null).catch(null),
  startDate: isoOrNull,
  targetDate: z.string().regex(ISO),
  steps: z.array(z.string().trim().min(1).max(200)).max(30).catch([]),
  measures: listOf(measureSchema, 8),
  levers: listOf(leverSchema, 10),
  /** Set by the app, never the model: attach the plan to a goal that already exists. */
  existingId: z.string().uuid().nullable().optional().transform((v) => v ?? null).catch(null),
  include: z.boolean().optional().catch(true).transform((v) => v ?? true),
});

const streamSchema = z.object({
  key: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(60),
  area: z.enum(AREAS).catch("self"),
  weeklyHours: z.number().min(0).max(168).nullable().optional().transform((v) => v ?? null).catch(null),
  include: z.boolean().optional().catch(true).transform((v) => v ?? true),
});

export const planDraftSchema = z.object({
  streams: listOf(streamSchema, 20),
  goals: listOf(goalSchema, 60),
  notes: z.string().max(20000).catch(""),
  questions: z.array(z.string().max(300)).max(20).catch([]),
});

export type PlanDraft = z.output<typeof planDraftSchema>;
export type DraftGoal = PlanDraft["goals"][number];
export type DraftMeasure = DraftGoal["measures"][number];
export type DraftCheckpoint = DraftMeasure["checkpoints"][number];
export type DraftLever = DraftGoal["levers"][number];
export type DraftStream = PlanDraft["streams"][number];

export const EMPTY_DRAFT: PlanDraft = { streams: [], goals: [], notes: "", questions: [] };

/**
 * Make a draft safe to save and say what was changed: unique keys, checkpoint
 * ranges the right way round, one checkpoint per date, holds after their
 * checkpoint, end dates after start dates, parents and streams that exist,
 * and no goal nested under itself.
 */
export function normalizeDraft(draft: PlanDraft, todayIso: string): { draft: PlanDraft; warnings: string[] } {
  const warnings: string[] = [];
  const streamKeys = new Set<string>();
  const streams = draft.streams.filter((s) => {
    if (streamKeys.has(s.key)) return false;
    streamKeys.add(s.key);
    return true;
  });

  const goalKeys = new Set<string>();
  const goals: DraftGoal[] = [];
  for (const g of draft.goals) {
    if (goalKeys.has(g.key)) continue;
    goalKeys.add(g.key);
    let start = g.startDate ?? todayIso;
    if (g.targetDate <= start) {
      if (g.targetDate > todayIso) start = todayIso;
      else {
        warnings.push(`“${g.title}” ends on ${g.targetDate}, which has passed. Change its end date or leave it out.`);
        goals.push({ ...g, include: false });
        continue;
      }
    }
    const measures = g.measures.map((m) => {
      const byDate = new Map<string, DraftCheckpoint>();
      for (const c of m.checkpoints) {
        let { min, max } = c;
        if (min === null && max === null) continue;
        if (min !== null && max !== null && min > max) [min, max] = [max, min];
        const holdUntil = c.holdUntil && c.holdUntil >= c.date ? c.holdUntil : null;
        byDate.set(c.date, { ...c, min, max, holdUntil });
      }
      const loanOk = m.source !== "loan_schedule" || (m.loanEmi !== null && m.loanLastEmiOn !== null);
      if (!loanOk) warnings.push(`“${m.label}” is a loan without an EMI and end date, so it's tracked as a typed number.`);
      const hasBaseline = m.baselineValue !== null && m.baselineOn !== null;
      return {
        ...m,
        source: loanOk ? m.source : "manual",
        baselineValue: hasBaseline ? m.baselineValue : null,
        baselineOn: hasBaseline ? m.baselineOn : null,
        checkpoints: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
    const levers = g.levers.map((l) => {
      const floor = l.floor === null ? Math.ceil(l.target / 2) : Math.min(l.floor, l.target);
      return { ...l, floor };
    });
    goals.push({
      ...g,
      startDate: start,
      streamKey: g.streamKey && streamKeys.has(g.streamKey) ? g.streamKey : null,
      measures,
      levers,
    });
  }

  // Parents must exist and must not loop back.
  const parentOf = new Map(goals.map((g) => [g.key, g.parentKey]));
  for (const g of goals) {
    if (!g.parentKey) continue;
    let ok = parentOf.has(g.parentKey);
    const seen = new Set([g.key]);
    for (let cursor: string | null | undefined = g.parentKey; ok && cursor; cursor = parentOf.get(cursor)) {
      if (seen.has(cursor)) ok = false;
      seen.add(cursor);
    }
    if (!ok) g.parentKey = null;
  }

  return { draft: { ...draft, streams, goals }, warnings };
}

/** Parents before children, so a child can point at its parent's new id. */
export function goalsInSaveOrder(goals: DraftGoal[]): DraftGoal[] {
  const byKey = new Map(goals.map((g) => [g.key, g]));
  const depth = (g: DraftGoal): number => {
    let d = 0;
    for (let p = g.parentKey; p && d < 20; p = byKey.get(p)?.parentKey ?? null) d++;
    return d;
  };
  return [...goals].sort((a, b) => depth(a) - depth(b));
}
