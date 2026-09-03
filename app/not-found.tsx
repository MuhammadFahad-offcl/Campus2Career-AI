import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-8 flex size-12 items-center justify-center rounded-xl bg-primary">
        <Zap className="size-6 text-primary-foreground" />
      </div>
      <h1 className="mb-2 text-6xl font-bold tracking-tight text-foreground">
        404
      </h1>
      <p className="mb-2 text-xl font-semibold text-foreground">
        Page not found
      </p>
      <p className="mb-8 max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className={cn(buttonVariants({ size: "sm" }))}
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>
    </div>
  );
}
