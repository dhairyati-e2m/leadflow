"use client";

import React, { useState } from "react";
import Link from "next/link";
import { apiForgotPassword, apiSecurityQuestionRecover } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Security question challenge state
  const [hasSecurityQuestion, setHasSecurityQuestion] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState<string | null>(null);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sqSuccess, setSqSuccess] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const res = await apiForgotPassword(email);
      setStatusMessage(res.message);
      if (res.has_security_question && res.security_question) {
        setHasSecurityQuestion(true);
        setSecurityQuestion(res.security_question);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process request.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSecurityQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await apiSecurityQuestionRecover({
        email,
        security_answer: securityAnswer,
        new_password: newPassword,
      });
      setSqSuccess(true);
      setStatusMessage(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Incorrect security question answer.";
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
          Reset Your Password
        </h1>
        <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1 max-w-xs mx-auto">
          Enter your registered email to receive a secure, 15-minute password reset link.
        </p>
      </div>

      {statusMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-950 dark:text-emerald-200">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-xs font-medium text-rose-950 dark:text-rose-200">
          {errorMessage}
        </div>
      )}

      {!hasSecurityQuestion && !sqSuccess && (
        <form onSubmit={handleRequestReset} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
              Work Email Address
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 btn-obsidian font-semibold rounded-xl text-xs transition shadow-obsidian disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? "Sending Reset Email..." : "Send Reset Instructions"}
          </button>
        </form>
      )}

      {hasSecurityQuestion && !sqSuccess && (
        <div className="mt-4 p-4 rounded-2xl bg-lilac-50/70 dark:bg-obsidian-800/80 border border-lilac-200 dark:border-obsidian-700 space-y-4">
          <div className="text-xs font-semibold text-obsidian dark:text-cosmic-100">
            Instant Recovery via Security Question
          </div>
          <p className="text-[11px] text-obsidian/70 dark:text-cosmic-300">
            Question: <span className="font-semibold text-obsidian dark:text-cosmic-100">{securityQuestion}</span>
          </p>
          <form onSubmit={handleSecurityQuestionSubmit} className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                Security Answer
              </label>
              <input
                type="text"
                required
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Your secret answer"
                className="w-full px-3 py-2 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-white dark:bg-obsidian-900 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                New Password (min 8 chars)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-xs border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-white dark:bg-obsidian-900 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-3 btn-obsidian font-semibold rounded-xl text-xs transition disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? "Updating Password..." : "Submit Answer & Reset"}
            </button>
          </form>
        </div>
      )}

      {sqSuccess && (
        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="inline-block py-2.5 px-6 btn-obsidian font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Go to Login
          </Link>
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-cosmic-200 dark:border-obsidian-800 text-center">
        <p className="text-xs text-obsidian/60 dark:text-cosmic-400">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold text-obsidian dark:text-cosmic-100 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
