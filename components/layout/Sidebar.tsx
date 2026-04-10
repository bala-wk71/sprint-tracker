"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

const icons: Record<string, string> = {
  LayoutDashboard: "📊",
  ListTodo: "📋",
  CalendarDays: "📅",
  BarChart3: "📈",
  Users: "👥",
  Settings: "⚙️",
};

export type SidebarUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Mobile hamburger (only visible when sidebar closed on mobile) */}
      {!mobileOpen && (
        <button
          className="fixed top-4 left-4 z-50 rounded-md border border-border bg-card p-2 shadow-md md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
      )}

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-60",
          "max-md:shadow-xl",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
      >
        {/* Logo area */}
        <div className="flex h-16 items-center border-b border-border px-4">
          {!collapsed && (
            <h1 className="text-lg font-semibold text-foreground">
              Sprint Tracker
            </h1>
          )}
          <button
            className="ml-auto hidden rounded p-1 text-muted-foreground hover:text-foreground md:block"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? "→" : "←"}
          </button>
          <button
            className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span className="text-lg">{icons[item.icon]}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User area */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.name}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {initials || "?"}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="mt-1 w-full rounded-md px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
