import type { Metadata } from "next";
import Link from "next/link";
import { Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
            <Zap className="size-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Campus2Career AI
          </h1>
          <p className="text-sm text-muted-foreground">
            AI Career Intelligence
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Welcome back</CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              Authentication will be available once Supabase Auth is configured.
            </p>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ size: "sm" }), "w-full justify-center")}
            >
              Continue to Dashboard
            </Link>
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
