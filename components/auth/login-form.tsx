"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signInAction } from "@/app/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Synchronous double-submit guard, same pattern used by every other
  // mutating panel in this app (see resume-uploader.tsx).
  const inFlightRef = useRef(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const result = await signInAction(email, password);
        if (result.status === "success") {
          router.push("/dashboard");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("An unexpected error occurred. Please check your connection and try again.");
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [email, password, router]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
          <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="login-email" className="text-xs font-medium text-foreground">
          Email
        </label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="login-password" className="text-xs font-medium text-foreground">
          Password
        </label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className={cn(buttonVariants({ size: "sm" }), "w-full justify-center")}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
      </button>
    </form>
  );
}
