import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Keep pdf-parse as a Node.js external on the server.
   * Its ESM entry re-exports pdfjs-dist which needs a browser worker.
   * Externalizing forces Node to load the self-contained CJS build. */
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    /* Allow larger file uploads (up to 10 MB for headroom above the 5 MB resume limit) */
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
