"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { isSuperAdmin, role } = await login(email, password);
      if (isSuperAdmin) {
        router.push("/super-admin");
      } else if (role === "client_viewer" || role === "reviewer") {
        router.push("/portal");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to sign in. Please verify your credentials.";
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
        <h1 className="text-2xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight mt-4">Sign in to LeadFlow</h1>
        <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1 max-w-xs mx-auto">
          Access your qualification funnel, 22-signal rules, and AI outreach studio.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-xs font-medium text-rose-950 dark:text-rose-200">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
            Work Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operator@company.com"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-[11px] text-lilac-600 dark:text-lilac-400 hover:underline font-medium"
            >
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 btn-obsidian font-semibold rounded-xl text-xs transition shadow-obsidian disabled:opacity-60 cursor-pointer"
        >
          {isSubmitting ? "Authenticating..." : "Enter Workspace"}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-cosmic-200 dark:border-obsidian-800 text-center">
        <p className="text-xs text-obsidian/60 dark:text-cosmic-400">
          Need a workspace?{" "}
          <Link href="/register" className="font-semibold text-obsidian dark:text-cosmic-100 hover:underline">
            Create an organization
          </Link>
        </p>
      </div>
    </div>
  );
}
