"use client";

import React, { useState } from "react";
import { submitAccessRequest } from "@/lib/api";

interface RequestAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RequestAccessModal({ isOpen, onClose, onSuccess }: RequestAccessModalProps) {
  const [orgName, setOrgName] = useState("");
  const [clientId, setClientId] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await submitAccessRequest({
        org_name: orgName.trim(),
        client_id: clientId.trim() || undefined,
        note: note.trim() || undefined,
      });

      setSuccessMsg(
        `Your request to join "${orgName.trim()}" has been submitted! An Organisation Administrator will review your request shortly.`
      );
      setOrgName("");
      setClientId("");
      setNote("");
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit access request";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md p-6 sm:p-7 rounded-3xl bg-[#0D0D12] dark:bg-[#FAF7F2] border border-obsidian-700 dark:border-cosmic-300 shadow-2xl text-cosmic-100 dark:text-obsidian">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-xl text-cosmic-400 dark:text-obsidian/50 hover:bg-obsidian-800 dark:hover:bg-cosmic-200 transition cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-lilac-950/80 text-lilac-400 dark:bg-lilac-100 dark:text-lilac-800 flex items-center justify-center font-bold text-lg border border-lilac-800/60 dark:border-lilac-300">
            🏢
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white dark:text-obsidian">
              Request Organisation Access
            </h2>
            <p className="text-xs text-cosmic-400 dark:text-obsidian/60">
              Join an existing team or client portal with administrator approval.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-xs text-rose-950 dark:text-rose-200 font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-900/80 text-xs text-emerald-950 dark:text-emerald-200 font-medium space-y-3">
            <p>{successMsg}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition"
            >
              Done
            </button>
          </div>
        )}

        {!successMsg && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60 mb-1">
                Target Organisation Name or Slug <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Acme Technologies"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-obsidian-800 dark:bg-white border border-obsidian-700 dark:border-cosmic-300 text-white dark:text-obsidian focus:outline-none focus:ring-2 focus:ring-lilac-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60 mb-1">
                Client ID / Account Identifier (Optional)
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="e.g. CLT-10492 or Client Alpha"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-obsidian-800 dark:bg-white border border-obsidian-700 dark:border-cosmic-300 text-white dark:text-obsidian focus:outline-none focus:ring-2 focus:ring-lilac-500"
              />
              <p className="text-[10px] text-cosmic-500 dark:text-obsidian/50 mt-1">
                If provided by your account manager, enter it here to expedite verification.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60 mb-1">
                Note for Administrator (Optional)
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Briefly state your role or reason for requesting access..."
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-obsidian-800 dark:bg-white border border-obsidian-700 dark:border-cosmic-300 text-white dark:text-obsidian focus:outline-none focus:ring-2 focus:ring-lilac-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-cosmic-400 dark:text-obsidian/60 hover:bg-obsidian-800 dark:hover:bg-cosmic-200 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !orgName.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-lilac-600 hover:bg-lilac-700 text-white disabled:opacity-50 transition cursor-pointer shadow-md"
              >
                {isSubmitting ? "Submitting..." : "Send Request"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
