import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // When an OAuth flow fails, Supabase falls back to redirecting to the Site
  // URL (root) with error params. Forward them to /login so they are shown
  // instead of being lost in the / -> /dashboard -> /login redirect chain.
  if (
    request.nextUrl.pathname === "/" &&
    (request.nextUrl.searchParams.has("error") ||
      request.nextUrl.searchParams.has("error_code"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const code =
      url.searchParams.get("error_code") ?? url.searchParams.get("error");
    if (code) url.searchParams.set("error", code);
    url.searchParams.delete("error_code");
    return NextResponse.redirect(url);
  }

  // Refresh the session - important for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except public routes)
  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/invite") ||
    request.nextUrl.pathname.startsWith("/callback") ||
    request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isPublicRoute && request.nextUrl.pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Redirect root to dashboard for authenticated users
  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
