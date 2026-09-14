import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DESCRIPTION =
  "AI-powered career intelligence for students, fresh graduates, and early-career professionals. Analyze your resume, identify skill gaps, and bridge the gap to your dream job.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Campus2Career AI — AI Career Intelligence",
    template: "%s | Campus2Career AI",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "Campus2Career AI — AI Career Intelligence",
    description: DESCRIPTION,
    url: APP_URL,
    siteName: "Campus2Career AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Campus2Career AI — AI Career Intelligence",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
