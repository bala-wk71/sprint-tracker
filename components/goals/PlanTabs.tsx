"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/sprint/setup", label: "This week", match: "/sprint" },
  { href: "/goals", label: "Goals", match: "/goals" },
] as const;

/** The week and the long view share one sidebar item; these tabs switch between them. */
export function PlanTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Plan"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {TABS.map((tab) => {
        const isActive = pathname === tab.match || pathname.startsWith(`${tab.match}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
