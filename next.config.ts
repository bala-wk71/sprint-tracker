import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A multi-year FitNotes export is a few MB of CSV, and the health importer
    // posts the file text to a Server Action. The 1MB default rejects it.
    serverActions: { bodySizeLimit: "5mb" },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
