"use client";

import { useRef, useState, useTransition } from "react";
import { RefreshCw, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { importCashewFile } from "./actions";

type Banner = { ok: boolean; text: string } | null;

/**
 * Cashew has no API and no way to be read from outside the app, so "sync" is
 * its CSV export handed to this app: shared straight from the phone's share
 * sheet (when installed), or picked here as a file. Either way the same sync
 * runs, and sending the same export twice changes nothing.
 */
export function CashewSync({
  lastSyncedAt,
  banner,
}: {
  lastSyncedAt: string | null;
  banner: Banner;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Banner>(banner);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    startTransition(async () => {
      const text = await file.text();
      const r = await importCashewFile(text);
      setResult(
        r.ok
          ? {
              ok: true,
              text: `Synced. ${r.added} new, ${r.removed} removed, ${r.total} in the file.`,
            }
          : { ok: false, text: r.error }
      );
      if (input.current) input.current.value = "";
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Cashew sync</h2>
        <span className="text-xs text-muted-foreground">
          {lastSyncedAt
            ? `Last synced ${new Date(lastSyncedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}`
            : "Not synced yet"}
        </span>
      </div>

      {result && (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-md px-3 py-2 text-sm",
            result.ok
              ? "bg-progress-good/15 text-foreground"
              : "bg-destructive/15 text-destructive"
          )}
        >
          {result.text}
        </p>
      )}

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          In Cashew: <span className="text-foreground">Settings → Import and export → Export CSV</span>.
        </li>
        <li>
          In the share sheet, pick <span className="text-foreground">Sprint Tracker</span>.
        </li>
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        Sprint Tracker only appears in the share sheet after you install it:
        open this site in Chrome on your phone, then menu → Add to Home screen
        → Install. Until then, save the CSV and pick it below.
      </p>

      <input
        ref={input}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {pending ? "Syncing…" : "Choose the CSV file"}
      </button>
    </section>
  );
}
