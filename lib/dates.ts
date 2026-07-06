import { headers } from "next/headers";
import { format, startOfWeek } from "date-fns";

/**
 * Today's date (YYYY-MM-DD) in the viewer's timezone.
 *
 * Server components run in UTC on Vercel, so `new Date().toISOString()` lags
 * UTC+ users by a day between their midnight and UTC midnight (~5:30h for
 * IST). Vercel forwards the visitor's IANA zone in `x-vercel-ip-timezone`;
 * locally the header is absent and the dev machine's own zone is correct.
 */
export async function todayIsoLocal(): Promise<string> {
  const h = await headers();
  const timeZone = h.get("x-vercel-ip-timezone");

  if (timeZone) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      // Unrecognised zone in the header — fall through to server-local time.
    }
  }

  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the week containing the given ISO date. */
export function mondayIsoOf(iso: string): string {
  return format(
    startOfWeek(new Date(`${iso}T00:00:00`), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );
}
