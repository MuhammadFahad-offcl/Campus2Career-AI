"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Next.js App Router error boundary component.
 * Catches runtime errors in child components and shows a recovery UI.
 */
export function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log to an error reporting service in production.
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. Please try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {process.env.NODE_ENV === "development" && (
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Button onClick={reset} variant="outline">
            Try Again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
