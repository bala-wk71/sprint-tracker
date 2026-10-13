import { NextResponse } from "next/server";
import { HOME_PATH } from "@/lib/constants";

// The install manifest. Served from a route rather than app/manifest.ts
// because Next's manifest type cannot describe share_target file params.
//
// share_target is what makes the Cashew sync two taps: once the app is
// installed, Android lists it in the share sheet for CSV files and posts the
// file to /money/share.
export function GET() {
  return NextResponse.json(
    {
      name: "Sprint Tracker",
      short_name: "Sprint",
      description: "Weekly sprint planning and productivity tracking",
      id: "/",
      start_url: HOME_PATH,
      scope: "/",
      display: "standalone",
      background_color: "#0D1117",
      theme_color: "#0D1117",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      share_target: {
        action: "/money/share",
        method: "POST",
        enctype: "multipart/form-data",
        params: {
          title: "title",
          text: "text",
          files: [
            {
              name: "file",
              accept: ["text/csv", "text/comma-separated-values", "text/plain", ".csv"],
            },
          ],
        },
      },
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
