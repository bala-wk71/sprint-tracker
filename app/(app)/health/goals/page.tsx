import { createClient, getUser } from "@/lib/supabase/server";
import { todayIsoLocal } from "@/lib/dates";
import { readHealthProfile } from "@/lib/health/profile";
import { GoalsForm } from "./GoalsForm";

export default async function HealthGoalsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const [profile, { data: latest }, todayIso] = await Promise.all([
    readHealthProfile(supabase, user.id),
    supabase
      .from("body_metrics")
      .select("weight_kg")
      .eq("owner_id", user.id)
      .not("weight_kg", "is", null)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    todayIsoLocal(),
  ]);

  return (
    <GoalsForm
      profile={profile}
      latestWeightKg={latest?.weight_kg ?? null}
      todayIso={todayIso}
    />
  );
}
