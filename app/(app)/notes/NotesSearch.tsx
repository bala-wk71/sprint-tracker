"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export function NotesSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  // Full-text search runs in Postgres against the note bodies, so it is a
  // navigation rather than local filtering — the sidebar already covers
  // title-only filtering without a round trip.
  const submit = (next: string) => {
    const trimmed = next.trim();
    router.push(trimmed ? `/notes?q=${encodeURIComponent(trimmed)}` : "/notes");
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(value);
          if (e.key === "Escape") {
            setValue("");
            submit("");
          }
        }}
        placeholder="Search inside every note…"
        aria-label="Search inside every note"
        className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {value && (
        <button
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
