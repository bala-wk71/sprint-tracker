import type { Metadata, Viewport } from "next";
import {
  Baloo_2,
  Geist,
  Geist_Mono,
  Nunito,
  Pixelify_Sans,
  Press_Start_2P,
  Rajdhani,
  Share_Tech_Mono,
} from "next/font/google";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { THEME_IDS } from "@/lib/themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Theme fonts. Not preloaded: a browser only downloads the ones the active
// theme actually uses.
const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
});
const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});
const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});
const pixelify = Pixelify_Sans({
  variable: "--font-pixelify",
  subsets: ["latin"],
  preload: false,
});
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  preload: false,
});
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Sprint Tracker",
  description: "Weekly sprint planning and productivity tracking",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sprint Tracker" },
};

export const viewport: Viewport = {
  // Lets the bottom tab bar pad itself clear of the phone's home indicator.
  viewportFit: "cover",
};

const fontVars = [
  geistSans,
  geistMono,
  rajdhani,
  shareTechMono,
  pressStart,
  pixelify,
  baloo,
  nunito,
]
  .map((f) => f.variable)
  .join(" ");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          themes={[...THEME_IDS, "colourful"]}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
