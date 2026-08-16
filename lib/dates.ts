import { headers } from "next/headers";
import { cache } from "react";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  DEFAULT_WEEK_START_DAY,
  toWeekStartDay,
  weekStartIsoOf,
  type WeekStartDay,
} from "@/lib/week";

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

/**
 * The day a user's sprint week starts on, straight from their profile.
 *
 * Memoized per request, so the handful of helpers that need it on one page
 * render share a single read. Pass `userId` to read someone else's setting —
 * reviewer pages render an owner's weeks, and those must follow the owner's
 * calendar, not the reviewer's.
 */
export const getWeekStartDay = cache(
  async (userId?: string): Promise<WeekStartDay> => {
    const id = userId ?? (await getUser())?.id;
    if (!id) return DEFAULT_WEEK_START_DAY;

    const supabase = await createClient();
    const { data } = await supabase
      .from("users")
      .select("week_start_day")
      .eq("id", id)
      .maybeSingle();

    return toWeekStartDay(data?.week_start_day);
  }
);

/** Start of the week containing `iso`, on the viewer's own calendar. */
export async function weekStartOf(iso: string): Promise<string> {
  return weekStartIsoOf(iso, await getWeekStartDay());
}

/** Start of the current week, on the viewer's own calendar. */
export async function currentWeekStart(): Promise<string> {
  return weekStartOf(await todayIsoLocal());
}
