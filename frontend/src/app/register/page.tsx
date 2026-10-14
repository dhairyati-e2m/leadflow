"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    setIsSubmitting(true);

    try {
      await register(email, password, fullName, orgName);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration could not be completed.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-8 sm:p-9 glass-panel rounded-3xl shadow-futuristic border border-blush-200/80">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-obsidian text-cosmic-100 rounded-2xl flex items-center justify-center font-bold text-base mx-auto shadow-obsidian border border-obsidian-200">
          LF
        </div>
        <h1 className="text-2xl font-bold text-obsidian tracking-tight mt-4">Create your workspace</h1>
        <p className="text-xs text-obsidian/60 mt-1 max-w-xs mx-auto">
          Provision a multi-tenant workspace and deploy your 22-signal qualification pipeline.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 mb-1">
            Operator Full Name
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 rounded-xl bg-cosmic-50/90 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 mb-1">
            Tenant Organization Name
          </label>
          <input
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Growth Partners"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 rounded-xl bg-cosmic-50/90 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 mb-1">
            Work Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@acmegrowth.com"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 rounded-xl bg-cosmic-50/90 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 mb-1">
            Password (min 8 chars)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 rounded-xl bg-cosmic-50/90 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 btn-obsidian font-semibold rounded-xl text-xs transition shadow-obsidian disabled:opacity-60"
        >
          {isSubmitting ? "Provisioning..." : "Initialize Workspace"}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-cosmic-200 text-center">
        <p className="text-xs text-obsidian/60">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-obsidian hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
