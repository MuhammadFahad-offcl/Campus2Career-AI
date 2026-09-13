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
  title: "Sign Up",
};

export default function RegisterPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="mesh-blob -left-24 top-10 size-72 bg-primary/25" aria-hidden="true" />
      <div className="mesh-blob -right-20 bottom-10 size-72 bg-accent/20" aria-hidden="true" />
      <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex size-11 items-center justify-center rounded-xl gradient-primary shadow-glow-primary">
            <Zap className="size-5 text-primary-foreground" />
          </div>
          <h1 className="gradient-text-primary text-xl font-bold tracking-tight">
            Campus2Career AI
          </h1>
          <p className="text-sm text-muted-foreground">
            AI Career Intelligence
          </p>
        </div>

        <Card className="shadow-elevated">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>
              Get started with AI-powered career intelligence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              Registration will be available once Supabase Auth is configured.
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
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
