import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Keep pdfjs-dist as a Node.js external on the server.
   * This prevents Next.js from bundling it (which would try to resolve
   * browser-only APIs like DOMMatrix) and forces Node's native require
   * to load the CJS-compatible build.
   *
   * We use pdfjs-dist directly instead of pdf-parse to avoid pulling in
   * @napi-rs/canvas which fails in serverless environments. */
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    /* Allow larger file uploads (up to 10 MB for headroom above the 5 MB resume limit) */
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
