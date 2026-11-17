import type { NextConfig } from "next";

// Cache Components stays off: every page is per-team and per-user, so pages
// render on each request rather than risk serving a cached view across teams.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // pdfjs loads its worker with a runtime import("./pdf.worker.mjs") that file
  // tracing can't see; ship it with every server function that renders PDFs.
  outputFileTracingIncludes: {
    "/t/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
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
