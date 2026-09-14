"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signUpAction } from "@/app/actions/auth";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const inFlightRef = useRef(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (inFlightRef.current) return;

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      inFlightRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const result = await signUpAction(email, password);
        if (result.status === "success") {
          if (result.requiresEmailConfirmation) {
            setAwaitingConfirmation(true);
          } else {
            router.push("/dashboard");
            router.refresh();
          }
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
    [email, password, confirmPassword, router]
  );

  if (awaitingConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
        <MailCheck className="size-6 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">Check your email</p>
          <p className="mt-1 text-xs text-emerald-700">
            We sent a confirmation link to {email}. Confirm it, then sign in to
            pick up right where you left off — anything you already did on this
            device will move into your new account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
          <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="register-email" className="text-xs font-medium text-foreground">
          Email
        </label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="register-password" className="text-xs font-medium text-foreground">
          Password
        </label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="register-confirm-password" className="text-xs font-medium text-foreground">
          Confirm password
        </label>
        <Input
          id="register-confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className={cn(buttonVariants({ size: "sm" }), "w-full justify-center")}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
      </button>

      <p className="text-center text-[11px] text-muted-foreground">
        By creating an account you agree to our{" "}
        <a href="/terms" className="underline hover:text-foreground">Terms</a>{" "}
        and{" "}
        <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
      </p>
    </form>
  );
}
