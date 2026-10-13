import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncCashewCsv } from "@/lib/money/import";

/**
 * Share target. With the app installed on a phone, "Sprint Tracker" shows up
 * in Android's share sheet (see app/manifest.webmanifest); sharing Cashew's
 * exported CSV to it lands here as a form post. The file is synced and the
 * browser is sent on to the Money page with the result.
 */
export async function POST(request: NextRequest) {
  const done = (params: Record<string, string>) => {
    const url = new URL("/money", request.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // 303 turns the POST into a GET, so a reload doesn't re-send the file.
    return NextResponse.redirect(url, 303);
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  let text = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File) {
      text = await file.text();
    } else {
      // Some apps share the CSV as plain text instead of a file.
      const shared = form.get("text");
      if (typeof shared === "string") text = shared;
    }
  } catch {
    return done({ sync: "error", why: "Could not read what was shared." });
  }
  if (!text.trim()) {
    return done({ sync: "error", why: "Nothing was shared. Share the CSV file." });
  }

  const result = await syncCashewCsv(supabase, user.id, text);
  if (!result.ok) return done({ sync: "error", why: result.error });
  return done({
    sync: "ok",
    added: String(result.added),
    removed: String(result.removed),
    total: String(result.total),
  });
}

// Opening the URL directly (no shared file) just goes to Money.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/money", request.url), 303);
}
