"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FilePlus2 } from "lucide-react";
import { createPage } from "./actions";

export function NewPageButtons({ parentId = null }: { parentId?: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const create = (kind: "page" | "meeting") => {
    startTransition(async () => {
      const result = await createPage({ parentId, kind });
      if (!result.ok) return;
      router.push(`/notes/${result.data.id}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => create("meeting")}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <CalendarClock className="h-4 w-4" />
        New meeting note
      </button>
      <button
        onClick={() => create("page")}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <FilePlus2 className="h-4 w-4" />
        New page
      </button>
    </div>
  );
}
