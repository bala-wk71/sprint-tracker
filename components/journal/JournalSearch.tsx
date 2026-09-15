"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/** Searches entries and past reflections server-side, keeping the active filter. */
export function JournalSearch({
  initialQuery,
  filter,
}: {
  initialQuery: string;
  filter: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  const submit = (next: string) => {
    const params = new URLSearchParams();
    if (next.trim()) params.set("q", next.trim());
    if (filter !== "all") params.set("type", filter);
    const qs = params.toString();
    router.push(qs ? `/journal?${qs}` : "/journal");
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id="journal_search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(value);
          if (e.key === "Escape") {
            setValue("");
            submit("");
          }
        }}
        placeholder="Search what you've written…"
        aria-label="Search your journal and reflections"
        className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
