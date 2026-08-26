import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { readHealthProfile } from "@/lib/health/profile";
import type { DatedValue } from "@/lib/health/units";
import { BodyLogger, type BodyRow } from "./BodyLogger";
import { BodyTrend } from "./BodyTrend";
import { BodyCharts } from "./BodyCharts";

const COLUMNS =
  "measured_on, weight_kg, body_fat_pct, muscle_mass_kg, water_pct, bone_mass_kg, visceral_fat, bmi, bmr, protein_pct, subcutaneous_fat_pct, skeletal_muscle_pct, metabolic_age, waist_cm, chest_cm, arm_cm, thigh_cm, hip_cm, neck_cm, notes";

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export default async function BodyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const todayIso = await todayIsoLocal();
  const date =
    params.date && isValidIsoDate(params.date) ? params.date : todayIso;

  const [profile, { data: rows }] = await Promise.all([
    readHealthProfile(supabase, user.id),
    supabase
      .from("body_metrics")
      .select(COLUMNS)
      .eq("owner_id", user.id)
      .order("measured_on", { ascending: true }),
  ]);

  const entries = (rows ?? []) as BodyRow[];
  const entry = entries.find((e) => e.measured_on === date) ?? null;

  const weightPoints: DatedValue[] = entries
    .filter((e) => e.weight_kg !== null)
    .map((e) => ({ date: e.measured_on, value: e.weight_kg as number }));

  return (
    <div className="space-y-6">
      <BodyLogger
        date={date}
        todayIso={todayIso}
        entry={entry}
        weightUnit={profile.weight_unit}
      />

      <BodyTrend
        points={weightPoints}
        weightUnit={profile.weight_unit}
        targetWeightKg={profile.target_weight_kg}
        goalType={profile.goal_type}
        todayIso={todayIso}
      />

      {/* Two empty chart frames are a screenful of nothing on a first visit —
          the trend card above already says what will appear here. */}
      {entries.length > 0 && (
        <BodyCharts
          entries={entries}
          weightUnit={profile.weight_unit}
          todayIso={todayIso}
        />
      )}
    </div>
  );
}
