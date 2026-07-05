import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Supabase may bounce back with an OAuth error instead of a code.
  const providerError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const url = new URL("/login", origin);
    url.searchParams.set("error", error.code ?? "exchange_failed");
    url.searchParams.set("error_description", error.message);
    return NextResponse.redirect(url);
  }

  const url = new URL("/login", origin);
  url.searchParams.set("error", errorCode ?? providerError ?? "auth_failed");
  if (errorDescription) {
    url.searchParams.set("error_description", errorDescription);
  }
  return NextResponse.redirect(url);
}
