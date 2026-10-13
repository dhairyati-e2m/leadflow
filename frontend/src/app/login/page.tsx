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
      await login(email, password);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to sign in. Please check your credentials.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl mx-auto shadow-md">
          LF
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-4">Sign in to LeadFlow</h1>
        <p className="text-xs text-slate-500 mt-1">
          Access your B2B lead queue, scoring rules, and outreach dashboard.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition shadow-sm disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-600">
          Need a workspace?{" "}
          <Link href="/register" className="font-semibold text-blue-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
