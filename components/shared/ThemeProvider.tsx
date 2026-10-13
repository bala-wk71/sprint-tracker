"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { THEME_COOKIE, toThemeId } from "@/lib/themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeCookieSync />
      {children}
    </NextThemesProvider>
  );
}

/**
 * Mirrors the chosen theme into a cookie. The theme itself lives in
 * localStorage (next-themes), which the server cannot see, and Home has a
 * different layout per theme — so the server needs to be told.
 */
function ThemeCookieSync() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    // The old "colourful" theme became Pastel.
    if (theme === "colourful") {
      setTheme("pastel");
      return;
    }
    const id = toThemeId(theme === "system" ? resolvedTheme : theme);
    if (!id) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${THEME_COOKIE}=`))
      ?.split("=")[1];
    if (current !== id) {
      document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [theme, resolvedTheme, setTheme, router]);

  return null;
}
