import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Server actions and the protected cron endpoint have nothing for a
      // crawler to index and shouldn't be indexed even if reachable.
      disallow: ["/api/"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
