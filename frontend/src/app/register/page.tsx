"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { registerAndRequestAccess } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [requestSuccessMessage, setRequestSuccessMessage] = useState<string | null>(null);

  const isDuplicateOrg =
    errorMessage?.toLowerCase().includes("already exists") || false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setRequestSuccessMessage(null);

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

  const handleSendRequest = async () => {
    setIsRequestingAccess(true);
    setErrorMessage(null);
    try {
      await registerAndRequestAccess({
        full_name: fullName,
        email,
        password,
        org_name: orgName,
      });
      setRequestSuccessMessage(
        `Your request to join "${orgName}" as a Client has been submitted! The Organisation Administrator has been notified to review and approve your access.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit access request";
      setErrorMessage(msg);
    } finally {
      setIsRequestingAccess(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-8 sm:p-9 glass-panel dark:bg-obsidian-900/95 rounded-3xl shadow-futuristic border border-blush-200/80 dark:border-obsidian-700">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-obsidian dark:bg-lilac-950/60 text-cosmic-100 dark:text-lilac-200 rounded-2xl flex items-center justify-center font-bold text-base mx-auto shadow-obsidian border border-obsidian-200 dark:border-lilac-800/60">
          LF
        </div>
        <h1 className="text-2xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight mt-4">Create your workspace</h1>
        <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1 max-w-xs mx-auto">
          Provision a multi-tenant workspace and deploy your 22-signal qualification pipeline.
        </p>
      </div>

      {requestSuccessMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-950 dark:text-emerald-200 space-y-3">
          <div className="flex items-center gap-2 font-bold">
            <span>✓</span>
            <span>Request Submitted Successfully</span>
          </div>
          <p className="leading-relaxed">{requestSuccessMessage}</p>
          <Link
            href="/login"
            className="inline-block w-full py-2 px-3 text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm"
          >
            Go to Sign In
          </Link>
        </div>
      )}

      {isDuplicateOrg && !requestSuccessMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs font-bold">
            <span>🏢</span>
            <span>Organisation Already Exists</span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            An organisation named <strong>"{orgName}"</strong> is already registered. You can submit an access request directly to its administrator to join as a <strong>Client</strong>.
          </p>
          <button
            type="button"
            disabled={isRequestingAccess}
            onClick={handleSendRequest}
            className="w-full py-2.5 px-4 rounded-xl bg-lilac-600 hover:bg-lilac-700 text-white font-bold text-xs transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
          >
            {isRequestingAccess ? (
              <>
                <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                <span>Sending Request...</span>
              </>
            ) : (
              <span>Send Request to Join as Client</span>
            )}
          </button>
        </div>
      )}

      {errorMessage && !isDuplicateOrg && !requestSuccessMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-xs font-medium text-rose-950 dark:text-rose-200">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
            Operator Full Name
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
            Organisation Name
          </label>
          <input
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Growth Partners"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
            Work Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@acmegrowth.com"
            className="w-full px-4 py-2.5 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
            Password (min 8 chars)
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 btn-obsidian font-semibold rounded-xl text-xs transition shadow-obsidian disabled:opacity-60 cursor-pointer"
        >
          {isSubmitting ? "Provisioning..." : "Initialize Workspace"}
        </button>
        <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400 text-center mt-3 leading-relaxed">
          Belong to an existing organization? After registering, you can submit a membership request to your organization administrator.
        </p>
      </form>

      <div className="mt-6 pt-6 border-t border-cosmic-200 dark:border-obsidian-800 text-center">
        <p className="text-xs text-obsidian/60 dark:text-cosmic-400">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-obsidian dark:text-cosmic-100 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
