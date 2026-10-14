"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { OrgAdminUser, fetchOrgMembers, transferOrgAdmin } from "@/lib/api";

interface TransferAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
}

export function TransferAdminModal({ isOpen, onClose, orgId, orgName }: TransferAdminModalProps) {
  const { user, refreshProfile } = useAuth();
  const [members, setMembers] = useState<OrgAdminUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [manualEmail, setManualEmail] = useState<string>("");
  const [useManualInput, setUseManualInput] = useState<boolean>(false);
  const [confirmationKeyword, setConfirmationKeyword] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && orgId) {
      setLoadingMembers(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setConfirmationKeyword("");
      setSelectedUserId("");
      setManualEmail("");

      fetchOrgMembers(orgId)
        .then((data) => {
          // Filter out the current user because you cannot transfer to yourself
          const eligible = data.filter((m) => m.user_id !== user?.id && m.email.toLowerCase() !== user?.email.toLowerCase());
          setMembers(eligible);
          if (eligible.length > 0) {
            setSelectedUserId(eligible[0].user_id);
          } else {
            setUseManualInput(true);
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to load organisation members";
          setErrorMessage(msg);
        })
        .finally(() => setLoadingMembers(false));
    }
  }, [isOpen, orgId, user]);

  if (!isOpen) return null;

  const targetMember = members.find((m) => m.user_id === selectedUserId);
  const targetEmailDisplay = useManualInput ? manualEmail.trim() : targetMember?.email || "selected member";

  const isConfirmed = confirmationKeyword.trim().toUpperCase() === "CONFIRM" && (useManualInput ? manualEmail.includes("@") : Boolean(selectedUserId));

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const payload = useManualInput
        ? { target_email: manualEmail.trim().toLowerCase() }
        : { target_user_id: selectedUserId };

      const res = await transferOrgAdmin(orgId, payload);
      setSuccessMessage(res.message || "Administration successfully transferred.");
      
      // Revalidate user profile & permissions immediately across tabs
      await refreshProfile();

      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to transfer administration.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-obsidian-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="glass-panel card-cosmic rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-blush-200 dark:border-obsidian-700 relative text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-cosmic-200 dark:border-obsidian-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-sm">
              👑
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                Transfer Organisation Administration
              </h3>
              <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                Organisation: <strong className="text-obsidian dark:text-cosmic-200 font-semibold">{orgName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-cosmic-200 hover:bg-cosmic-300 dark:bg-obsidian-800 dark:hover:bg-obsidian-700 text-obsidian dark:text-cosmic-200 flex items-center justify-center font-bold text-lg transition cursor-pointer"
            title="Cancel"
          >
            &times;
          </button>
        </div>

        {/* Warning Notice */}
        <div className="my-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 text-xs text-amber-950 dark:text-amber-200 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-100">
            <span>⚠️</span> Important Responsibility Handover
          </div>
          <p className="text-[11px] leading-relaxed">
            Transferring administration is <strong>permanent and immediate</strong>. The chosen member will be granted full administrative ownership of <strong>{orgName}</strong>. Your account will be demoted to <strong>Analyst</strong>, and your active elevated session tokens will be revoked across all devices.
          </p>
        </div>

        {successMessage ? (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-900 dark:text-emerald-200 text-center my-4 space-y-2">
            <div className="text-xl">✓</div>
            <div>{successMessage}</div>
            <div className="text-[11px] font-normal text-emerald-800 dark:text-emerald-300">
              Reloading workspace with updated Analyst permissions...
            </div>
          </div>
        ) : (
          <form onSubmit={handleTransfer} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-900 text-xs text-rose-950 dark:text-rose-200 font-medium">
                {errorMessage}
              </div>
            )}

            {/* Member Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/70 dark:text-cosmic-300">
                  Select New Administrator
                </label>
                {members.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseManualInput(!useManualInput)}
                    className="text-[11px] text-lilac-600 dark:text-lilac-400 hover:underline cursor-pointer"
                  >
                    {useManualInput ? "Choose from member list" : "Enter email manually"}
                  </button>
                )}
              </div>

              {loadingMembers ? (
                <div className="py-4 text-center text-xs text-obsidian/50 dark:text-cosmic-400">
                  Loading organisation members...
                </div>
              ) : !useManualInput && members.length > 0 ? (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-cosmic-300 dark:border-obsidian-700 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-500 font-sans"
                >
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name} ({m.email}) — Current Role: {m.role}
                    </option>
                  ))}
                </select>
              ) : (
                <div>
                  <input
                    type="email"
                    required
                    placeholder="member@organisation.com"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-cosmic-300 dark:border-obsidian-700 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-500 font-mono"
                  />
                  <p className="text-[10px] text-obsidian/50 dark:text-cosmic-400 mt-1">
                    The recipient must already belong to this organisation.
                  </p>
                </div>
              )}
            </div>

            {/* Explicit Confirmation */}
            <div className="pt-2 border-t border-cosmic-200/80 dark:border-obsidian-800">
              <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/70 dark:text-cosmic-300 mb-1">
                Type <span className="text-rose-600 dark:text-rose-400 font-black">CONFIRM</span> to Authorise
              </label>
              <input
                type="text"
                required
                placeholder="Type CONFIRM"
                value={confirmationKeyword}
                onChange={(e) => setConfirmationKeyword(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-cosmic-300 dark:border-obsidian-700 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono uppercase"
              />
              <p className="text-[10px] text-obsidian/50 dark:text-cosmic-400 mt-1">
                Authorises atomic ownership transfer to <strong className="text-obsidian dark:text-cosmic-200">{targetEmailDisplay}</strong>.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-obsidian/70 dark:text-cosmic-300 hover:bg-cosmic-200 dark:hover:bg-obsidian-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isConfirmed || isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white shadow-sm transition cursor-pointer"
              >
                {isSubmitting ? "Transferring..." : "Confirm Administration Transfer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
