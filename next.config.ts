import type { NextConfig } from "next";

// Cache Components stays off: every page is per-team and per-user, so pages
// render on each request rather than risk serving a cached view across teams.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
