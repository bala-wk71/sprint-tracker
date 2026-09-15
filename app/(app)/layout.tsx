import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { QuickLog } from "@/components/health/QuickLog";
import { createClient, getUser } from "@/lib/supabase/server";
import { levelFromXp } from "@/lib/gamification";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const [{ data: totalXp }, { count: reviewingCount }] = await Promise.all([
    supabase.rpc("total_xp"),
    supabase
      .from("reviewer_relationships")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", user.id),
  ]);
  const level = levelFromXp(Number(totalXp ?? 0));

  const meta = user.user_metadata ?? {};
  const sidebarUser = {
    name:
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      user.email?.split("@")[0] ??
      "User",
    email: user.email ?? "",
    avatarUrl: (meta.avatar_url as string | undefined) ?? null,
    level: level.level,
    levelTitle: level.title,
    levelProgressPct: Math.min(
      100,
      Math.round((level.progress / level.span) * 100)
    ),
  };

  return (
    <div className="flex min-h-dvh">
      <Sidebar user={sidebarUser} isReviewer={(reviewingCount ?? 0) > 0} />
      {/* min-w-0: without it this flex child cannot shrink below the widest
          row inside it, so one wide table or button cluster drags the entire
          page sideways on a phone instead of wrapping.
          --sidebar-w is set by Sidebar so collapsing it doesn't leave a gap. */}
      <div className="flex min-w-0 flex-1 flex-col transition-[margin] duration-200 md:ml-[var(--sidebar-w,15rem)]">
        <Header />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
      {/* Logging water or a weight has to be possible from wherever you are —
          having to navigate to the Health tab first is the friction that turns
          a daily habit into a weekly one. */}
      <QuickLog />
    </div>
  );
}
