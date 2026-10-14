"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiResetPassword, apiVerifyResetToken } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setErrorMessage("No password reset token was provided in the URL.");
      return;
    }

    const verify = async () => {
      try {
        const res = await apiVerifyResetToken(token);
        if (res.valid) {
          setTokenValid(true);
          setUserEmail(res.email || null);
        } else {
          setTokenValid(false);
          setErrorMessage(res.message || "This password reset link is invalid or has expired.");
        }
      } catch {
        setTokenValid(false);
        setErrorMessage("Network error while verifying reset token.");
      } finally {
        setVerifying(false);
      }
    };

    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiResetPassword(token, password);
      setSuccessMessage(res.message);
      setTimeout(() => {
        router.push("/login");
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset password.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-14 p-8 sm:p-9 glass-panel dark:bg-obsidian-900/95 rounded-3xl shadow-futuristic border border-blush-200/80 dark:border-obsidian-700">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-obsidian dark:bg-lilac-950/60 text-cosmic-100 dark:text-lilac-200 rounded-2xl flex items-center justify-center font-bold text-base mx-auto shadow-obsidian border border-obsidian-200 dark:border-lilac-800/60">
          LF
        </div>
        <h1 className="text-2xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight mt-4">
          Choose a New Password
        </h1>
        {userEmail && (
          <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1 max-w-xs mx-auto">
            Updating password for <span className="font-semibold text-obsidian dark:text-cosmic-100">{userEmail}</span>
          </p>
        )}
      </div>

      {verifying && (
        <div className="py-8 text-center text-xs font-mono text-obsidian/60 dark:text-cosmic-400">
          Validating security reset token...
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-xs font-medium text-rose-950 dark:text-rose-200">
          {errorMessage}
          {!tokenValid && (
            <div className="mt-2">
              <Link href="/forgot-password" className="underline font-bold">
                Request a new password reset link
              </Link>
            </div>
          )}
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-950 dark:text-emerald-200">
          {successMessage}
          <div className="mt-1 text-[11px] opacity-80">Redirecting to sign-in page...</div>
        </div>
      )}

      {!verifying && tokenValid && !successMessage && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 btn-obsidian font-semibold rounded-xl text-xs transition shadow-obsidian disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? "Updating Password..." : "Update Password & Sign In"}
          </button>
        </form>
      )}

      <div className="mt-6 pt-6 border-t border-cosmic-200 dark:border-obsidian-800 text-center">
        <p className="text-xs text-obsidian/60 dark:text-cosmic-400">
          <Link href="/login" className="font-semibold text-obsidian dark:text-cosmic-100 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto my-14 p-8 text-center text-xs font-mono text-obsidian/60 dark:text-cosmic-400">
          Loading reset password page...
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
