"use client";

import React, { useState, useEffect } from "react";
import {
  AccessRequestItem,
  fetchOrgAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
} from "@/lib/api";

interface OrgAccessRequestsCardProps {
  orgId: string;
  orgName: string;
}

export function OrgAccessRequestsCard({ orgId, orgName }: OrgAccessRequestsCardProps) {
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  const loadRequests = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await fetchOrgAccessRequests(orgId);
      setRequests(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load access requests";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [orgId]);

  const handleApprove = async (reqId: string) => {
    const role = selectedRole[reqId] || "client_viewer";
    setActingId(reqId);
    setErrorMsg(null);
    setActionSuccess(null);
    try {
      const updated = await approveAccessRequest(orgId, reqId, role);
      setRequests((prev) => prev.map((r) => (r.id === reqId ? updated : r)));
      setActionSuccess(`Approved access for "${updated.user_full_name}" as ${role}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve request";
      setErrorMsg(msg);
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (reqId: string) => {
    setActingId(reqId);
    setErrorMsg(null);
    setActionSuccess(null);
    try {
      const updated = await rejectAccessRequest(orgId, reqId, rejectReason.trim() || undefined);
      setRequests((prev) => prev.map((r) => (r.id === reqId ? updated : r)));
      setActionSuccess(`Rejected access request for "${updated.user_full_name}".`);
      setRejectingId(null);
      setRejectReason("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject request";
      setErrorMsg(msg);
    } finally {
      setActingId(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const reviewedRequests = requests.filter((r) => r.status !== "pending");

  return (
    <div className="glass-panel card-cosmic rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 flex items-center justify-center font-bold text-lg border border-lilac-200 dark:border-obsidian-700">
            👥
          </div>
          <div>
            <h3 className="text-base font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
              Member & Client Access Requests
            </h3>
            <p className="text-xs text-obsidian/60 dark:text-cosmic-400">
              Review and authorize pending access requests for {orgName}.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadRequests}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-100 dark:hover:bg-obsidian-800 text-xs font-semibold text-obsidian/75 dark:text-cosmic-300 transition"
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-xs text-rose-950 dark:text-rose-200 font-medium">
          {errorMsg}
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-900/80 text-xs text-emerald-950 dark:text-emerald-200 font-medium">
          {actionSuccess}
        </div>
      )}

      {/* Pending Requests Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400">
          <span>Pending Approvals ({pendingRequests.length})</span>
        </div>

        {loading ? (
          <div className="py-6 text-center text-xs text-obsidian/50 dark:text-cosmic-400">
            Loading requests...
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="py-6 text-center text-xs rounded-2xl bg-cosmic-50/60 dark:bg-obsidian-900/40 border border-dashed border-cosmic-300 dark:border-obsidian-800 text-obsidian/50 dark:text-cosmic-400">
            No pending access requests for this organisation.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-2xl bg-white dark:bg-obsidian-900/90 border border-cosmic-200 dark:border-obsidian-700 shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-obsidian dark:text-cosmic-100">
                      {req.user_full_name}
                    </div>
                    <div className="text-xs text-obsidian/60 dark:text-cosmic-400">
                      {req.user_email}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                      PENDING REVIEW
                    </span>
                    <span className="text-[10px] font-mono text-obsidian/40 dark:text-cosmic-400">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-cosmic-50/80 dark:bg-obsidian-800/60 p-2.5 rounded-xl border border-cosmic-200 dark:border-obsidian-700">
                  <div>
                    <span className="text-obsidian/50 dark:text-cosmic-400 font-mono text-[10px] uppercase">
                      Client ID / Ref:
                    </span>{" "}
                    <span className="font-semibold text-obsidian dark:text-cosmic-100 font-mono">
                      {req.client_id || "None provided"}
                    </span>
                  </div>
                  <div>
                    <span className="text-obsidian/50 dark:text-cosmic-400 font-mono text-[10px] uppercase">
                      Requester Note:
                    </span>{" "}
                    <span className="text-obsidian/80 dark:text-cosmic-300 italic">
                      {req.note || "No note attached"}
                    </span>
                  </div>
                </div>

                {/* Decision Actions */}
                {rejectingId === req.id ? (
                  <div className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-2 animate-in fade-in">
                    <label className="block text-[11px] font-bold text-rose-900 dark:text-rose-200">
                      Specify Rejection Reason (Optional):
                    </label>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Unrecognized email or client ID..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-obsidian-800 border border-rose-300 dark:border-rose-800 text-obsidian dark:text-cosmic-100"
                    />
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-semibold text-obsidian/60 dark:text-cosmic-400 hover:bg-white dark:hover:bg-obsidian-800 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={actingId === req.id}
                        onClick={() => handleReject(req.id)}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
                      >
                        {actingId === req.id ? "Rejecting..." : "Confirm Rejection"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono uppercase font-bold text-obsidian/60 dark:text-cosmic-400">
                        Granted Role:
                      </span>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-obsidian-700">
                        Client Viewer (Read-only)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actingId === req.id}
                        onClick={() => setRejectingId(req.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300 dark:border-rose-900/60 transition cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={actingId === req.id}
                        onClick={() => handleApprove(req.id)}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-sm"
                      >
                        {actingId === req.id ? "Approving..." : "Approve Access"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Decisions History */}
      {reviewedRequests.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-cosmic-200 dark:border-obsidian-800">
          <div className="text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/50 dark:text-cosmic-400">
            Decision History ({reviewedRequests.length})
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {reviewedRequests.slice(0, 5).map((req) => (
              <div
                key={req.id}
                className="p-2.5 rounded-xl bg-cosmic-50/50 dark:bg-obsidian-900/50 border border-cosmic-200/80 dark:border-obsidian-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-obsidian dark:text-cosmic-100">
                    {req.user_full_name}
                  </span>{" "}
                  <span className="text-obsidian/50 dark:text-cosmic-400">({req.user_email})</span>
                  {req.rejection_reason && (
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                      Reason: {req.rejection_reason}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                      req.status === "approved"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                    }`}
                  >
                    {req.status.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono text-obsidian/40 dark:text-cosmic-400">
                    {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
