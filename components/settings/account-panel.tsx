"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogOut } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOutAction, deleteAccountAction } from "@/app/actions/auth";

interface AccountPanelProps {
  email: string;
}

/**
 * Signed-in account controls: sign out, and a two-step-confirmed,
 * irreversible account deletion (every owned resume/analysis/rewrite/
 * skill-bridge row + storage object + the auth user itself — see
 * deleteAccountAction).
 */
export function AccountPanel({ email }: AccountPanelProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutAction();
    } finally {
      setSigningOut(false);
      router.push("/");
      router.refresh();
    }
  }, [signingOut, router]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteAccountAction();
      if (result.status === "success") {
        router.push("/");
        router.refresh();
        return;
      }
      setError(result.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  }, [deleting, router]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{email}</p>
          <p className="text-xs text-muted-foreground">Signed in</p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          {signingOut ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <LogOut className="size-3.5" />
          )}
          Sign out
        </button>
      </div>

      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Delete account</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permanently deletes your account and every resume, analysis,
              rewrite, skill-bridge plan, and interview session you own.
              This cannot be undone.
            </p>

            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

            <div className="mt-3">
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className={cn(buttonVariants({ size: "sm", variant: "destructive" }))}
                >
                  Delete my account
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={cn(buttonVariants({ size: "sm", variant: "destructive" }))}
                  >
                    {deleting && <Loader2 className="size-3.5 animate-spin" />}
                    Yes, permanently delete everything
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
