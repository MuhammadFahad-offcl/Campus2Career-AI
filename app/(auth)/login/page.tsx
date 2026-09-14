import type { Metadata } from "next";
import Link from "next/link";
import { Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
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
            <CardTitle className="text-lg">Welcome back</CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </Link>
            </p>
            <Link
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Continue without an account
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
