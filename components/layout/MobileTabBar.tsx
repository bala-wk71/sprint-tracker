"use client";

import Link from "next/link";
import {
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  Menu,
  NotebookPen,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: readonly string[];
};

// The daily log sits in the middle, under the thumb: it is the page opened
// most. Todo and Notes flank it; the weekly pages live behind "More".
const LEFT: readonly Tab[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, match: ["/dashboard"] },
  { href: "/todo", label: "Todo", icon: CheckSquare, match: ["/todo"] },
];
const CENTRE: Tab = {
  href: "/daily",
  label: "Today",
  icon: CalendarDays,
  match: ["/daily"],
};
const RIGHT: readonly Tab[] = [
  { href: "/notes", label: "Notes", icon: NotebookPen, match: ["/notes", "/journal"] },
];

function isActive(pathname: string, tab: Tab) {
  return tab.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function MobileTabBar({
  pathname,
  labels,
  moreOpen,
  onMore,
}: {
  pathname: string;
  /** Theme-specific names, keyed by href. */
  labels: Record<string, string>;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const all = [...LEFT, CENTRE, ...RIGHT];
  const onMorePage = !all.some((t) => isActive(pathname, t));

  const item = (tab: Tab) => {
    const active = !moreOpen && isActive(pathname, tab);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <tab.icon className="h-5 w-5" />
        <span className="max-w-full truncate px-1">
          {labels[tab.href] ?? tab.label}
        </span>
      </Link>
    );
  };

  const centreActive = !moreOpen && isActive(pathname, CENTRE);

  return (
    <nav
      aria-label="Main"
      className="tabbar fixed inset-x-0 bottom-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {LEFT.map(item)}
      <Link
        href={CENTRE.href}
        aria-current={centreActive ? "page" : undefined}
        className="flex flex-1 flex-col items-center justify-end gap-0.5 pb-1.5 text-[11px] font-semibold text-primary"
      >
        <span
          className={cn(
            "tabbar-centre -mt-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg",
            centreActive && "ring-2 ring-primary/40"
          )}
        >
          <CENTRE.icon className="h-5 w-5" />
        </span>
        <span>{CENTRE.label}</span>
      </Link>
      {RIGHT.map(item)}
      <button
        type="button"
        onClick={onMore}
        aria-expanded={moreOpen}
        aria-label={moreOpen ? "Close menu" : "More pages"}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
          moreOpen || onMorePage ? "text-primary" : "text-muted-foreground"
        )}
      >
        {moreOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        <span>More</span>
      </button>
    </nav>
  );
}
