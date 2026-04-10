import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const meta = user.user_metadata ?? {};
  const sidebarUser = {
    name:
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      user.email?.split("@")[0] ??
      "User",
    email: user.email ?? "",
    avatarUrl: (meta.avatar_url as string | undefined) ?? null,
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar user={sidebarUser} />
      <div className="flex flex-1 flex-col md:ml-60">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
