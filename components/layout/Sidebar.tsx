"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Compass,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, type NavItem } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

const icons: Record<string, LucideIcon> = {
  LayoutDashboard,
  Compass,
  CalendarDays,
  BarChart3,
  Users,
  CheckSquare,
  Bot,
  NotebookPen,
  HeartPulse,
  GraduationCap,
};

const COLLAPSED_KEY = "sidebar-collapsed";
const COLLAPSED_EVENT = "sidebar-collapsed-change";

// The collapsed preference lives in localStorage; reading it through an
// external store keeps server render (always expanded) and client in sync
// without a setState-in-effect.
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_EVENT, onChange);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export type SidebarUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
  level: number;
  levelTitle: string;
  /** 0–100 progress within the current level. */
  levelProgressPct: number;
};

function isActivePath(pathname: string, item: NavItem) {
  return (item.match ?? [item.href]).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function Sidebar({
  user,
  isReviewer,
}: {
  user: SidebarUser;
  isReviewer: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // The content column offsets itself by this variable, so collapsing the
  // sidebar actually gives the page the space back.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-w",
      collapsed ? "4rem" : "15rem"
    );
  }, [collapsed]);

  const toggleCollapsed = () => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  };

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

  const settingsActive = pathname.startsWith("/settings");

  return (
    <>
      {/* Mobile hamburger (only visible when sidebar closed on mobile) */}
      {!mobileOpen && (
        <button
          className="fixed top-4 left-4 z-50 rounded-md border border-border bg-card p-2 text-foreground shadow-md md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
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
          collapsed ? "md:w-16" : "md:w-60",
          "w-60 max-md:shadow-xl",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
      >
        {/* Logo area */}
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <h1
            className={cn(
              "text-lg font-semibold text-foreground",
              collapsed && "md:hidden"
            )}
          >
            Sprint Tracker
          </h1>
          <button
            className="ml-auto hidden rounded p-1 text-muted-foreground hover:text-foreground md:block"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          <button
            className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {NAV_GROUPS.map((group, groupIndex) => {
            const items = group.items.filter(
              (item) =>
                !item.reviewerOnly || isReviewer || isActivePath(pathname, item)
            );
            if (items.length === 0) return null;
            return (
              <div key={group.label} className={groupIndex > 0 ? "mt-4" : undefined}>
                <p
                  className={cn(
                    "px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70",
                    collapsed && "md:hidden"
                  )}
                >
                  {group.label}
                </p>
                {groupIndex > 0 && (
                  <div
                    className={cn(
                      "mx-2 mb-2 hidden h-px bg-border",
                      collapsed && "md:block"
                    )}
                  />
                )}
                <div className="space-y-1">
                  {items.map((item) => {
                    const isActive = isActivePath(pathname, item);
                    const Icon = icons[item.icon];
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                        title={collapsed ? item.label : undefined}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
                        <span className={cn(collapsed && "md:hidden")}>
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User area — also the way into Settings */}
        <div className="border-t border-border p-3">
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
              settingsActive ? "bg-primary/10" : "hover:bg-accent"
            )}
            title={collapsed ? "Settings" : undefined}
            aria-label={`${user.name} — open settings`}
            aria-current={settingsActive ? "page" : undefined}
          >
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {initials || "?"}
              </div>
            )}
            <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
              <p className="truncate text-sm font-medium text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-primary">
                Lv {user.level} · {user.levelTitle}
              </p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${user.levelProgressPct}%` }}
                />
              </div>
            </div>
            <Settings
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground",
                settingsActive && "text-primary",
                collapsed && "md:hidden"
              )}
            />
          </Link>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className={cn(
              "mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50",
              collapsed && "md:justify-center"
            )}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "md:hidden")}>
              {signingOut ? "Signing out…" : "Sign out"}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
