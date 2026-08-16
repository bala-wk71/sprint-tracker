import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
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
  const { data: totalXp } = await supabase.rpc("total_xp");
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
      <Sidebar user={sidebarUser} />
      {/* min-w-0: without it this flex child cannot shrink below the widest
          row inside it, so one wide table or button cluster drags the entire
          page sideways on a phone instead of wrapping. */}
      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        <Header />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
