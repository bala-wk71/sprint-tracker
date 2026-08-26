"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileUp, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_TABS } from "@/lib/health/constants";

export function HealthTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {HEALTH_TABS.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
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

      <Link
        href="/health/goals"
        className={cn(
          "flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent",
          pathname.startsWith("/health/goals")
            ? "border-primary text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Goals
      </Link>

      <Link
        href="/health/import"
        className={cn(
          "flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent",
          pathname.startsWith("/health/import")
            ? "border-primary text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <FileUp className="h-3.5 w-3.5" />
        Import
      </Link>
    </div>
  );
}
