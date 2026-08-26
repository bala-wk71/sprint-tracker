"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { awardXp } from "@/lib/gamification";

type BodyMetricsInsert = Database["public"]["Tables"]["body_metrics"]["Insert"];

export type ActionResult<T = undefined> =
  | ({ ok: true; xp?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

/**
 * Every measurement is optional and nullable — a scale that reports thirteen
 * numbers and a tape measure that reports one both save through here, and
 * clearing a field has to mean "delete this reading", not "leave it alone".
 */
const measurement = z.number().finite().nullable().optional();

const saveSchema = z.object({
  measuredOn: isoDate,
  weightKg: z.number().min(20).max(400).nullable().optional(),
  bodyFatPct: z.number().min(1).max(75).nullable().optional(),
  muscleMassKg: measurement,
  waterPct: measurement,
  boneMassKg: measurement,
  visceralFat: measurement,
  bmi: measurement,
  bmr: z.number().int().nullable().optional(),
  proteinPct: measurement,
  subcutaneousFatPct: measurement,
  skeletalMusclePct: measurement,
  metabolicAge: z.number().int().nullable().optional(),
  waistCm: measurement,
  chestCm: measurement,
  armCm: measurement,
  thighCm: measurement,
  hipCm: measurement,
  neckCm: measurement,
  notes: z.string().max(500).nullable().optional(),
});

/**
 * Spread rather than a key-mapping loop, so the column names stay type-checked
 * against the generated Insert type. `undefined` is dropped by the spread,
 * which is what keeps "not sent" distinct from an explicit null — the quick-log
 * sheet posts only a weight and must not wipe the day's other readings.
 */
function toRow(
  ownerId: string,
  { measuredOn, ...f }: z.infer<typeof saveSchema>
): BodyMetricsInsert {
  return {
    owner_id: ownerId,
    measured_on: measuredOn,
    source: "manual",
    ...(f.weightKg !== undefined && { weight_kg: f.weightKg }),
    ...(f.bodyFatPct !== undefined && { body_fat_pct: f.bodyFatPct }),
    ...(f.muscleMassKg !== undefined && { muscle_mass_kg: f.muscleMassKg }),
    ...(f.waterPct !== undefined && { water_pct: f.waterPct }),
    ...(f.boneMassKg !== undefined && { bone_mass_kg: f.boneMassKg }),
    ...(f.visceralFat !== undefined && { visceral_fat: f.visceralFat }),
    ...(f.bmi !== undefined && { bmi: f.bmi }),
    ...(f.bmr !== undefined && { bmr: f.bmr }),
    ...(f.proteinPct !== undefined && { protein_pct: f.proteinPct }),
    ...(f.subcutaneousFatPct !== undefined && {
      subcutaneous_fat_pct: f.subcutaneousFatPct,
    }),
    ...(f.skeletalMusclePct !== undefined && {
      skeletal_muscle_pct: f.skeletalMusclePct,
    }),
    ...(f.metabolicAge !== undefined && { metabolic_age: f.metabolicAge }),
    ...(f.waistCm !== undefined && { waist_cm: f.waistCm }),
    ...(f.chestCm !== undefined && { chest_cm: f.chestCm }),
    ...(f.armCm !== undefined && { arm_cm: f.armCm }),
    ...(f.thighCm !== undefined && { thigh_cm: f.thighCm }),
    ...(f.hipCm !== undefined && { hip_cm: f.hipCm }),
    ...(f.neckCm !== undefined && { neck_cm: f.neckCm }),
    ...(f.notes !== undefined && { notes: f.notes }),
  };
}

export async function saveBodyMetrics(
  input: z.infer<typeof saveSchema>
): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { measuredOn } = parsed.data;
  const row = toRow(user.id, parsed.data);

  const supabase = await createClient();
  const { error } = await supabase
    .from("body_metrics")
    .upsert(row, { onConflict: "owner_id,measured_on" });

  if (error) return { ok: false, error: error.message };

  // One award per day, however many times the row is corrected.
  const xp =
    parsed.data.weightKg != null
      ? await awardXp(supabase, user.id, "weight_logged", measuredOn)
      : 0;

  revalidatePath("/health/body");
  revalidatePath("/health");
  return { ok: true, xp };
}

export async function deleteBodyMetrics(
  measuredOn: string
): Promise<ActionResult> {
  const parsed = isoDate.safeParse(measuredOn);
  if (!parsed.success) return { ok: false, error: "Invalid date" };

  const user = await getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("body_metrics")
    .delete()
    .eq("owner_id", user.id)
    .eq("measured_on", parsed.data);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/health/body");
  revalidatePath("/health");
  return { ok: true };
}
