"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  AdminOrgItem,
  AuditLogItem,
  OrgAdminUser,
  WorkspaceRequestItem,
  fetchAdminOrgs,
  updateAdminOrg,
  createAdminOrg,
  fetchAuditLogs,
  fetchOrgAdmins,
  assignOrgAdmin,
  removeOrgAdmin,
  fetchAdminWorkspaceRequests,
  approveWorkspaceRequest,
  rejectWorkspaceRequest,
} from "@/lib/api";

export function SuperAdminPortal() {
  const { switchOrganization } = useAuth();
  const [orgs, setOrgs] = useState<AdminOrgItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [workspaceRequests, setWorkspaceRequests] = useState<WorkspaceRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingRequests, setLoadingRequests] = useState<boolean>(false);
  const [updatingOrgId, setUpdatingOrgId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"orgs" | "requests" | "admin_transfers" | "audit">("orgs");
  const [actioningRequestId, setActioningRequestId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<Record<string, string>>({});
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);

  // Dedicated Org Admin Changes / Transfers Tab State
  const [transferOrgId, setTransferOrgId] = useState<string>("");
  const [transferAdmins, setTransferAdmins] = useState<OrgAdminUser[]>([]);
  const [loadingTransferAdmins, setLoadingTransferAdmins] = useState<boolean>(false);
  const [newAdminEmail, setNewAdminEmail] = useState<string>("");
  const [isChangingAdmin, setIsChangingAdmin] = useState<boolean>(false);
  const [changeAdminError, setChangeAdminError] = useState<string | null>(null);

  // Add Organisation Modal State
  const [showCreateOrgModal, setShowCreateOrgModal] = useState<boolean>(false);
  const [createOrgName, setCreateOrgName] = useState<string>("");
  const [createOrgEmail, setCreateOrgEmail] = useState<string>("");
  const [createOrgAdminName, setCreateOrgAdminName] = useState<string>("");
  const [createOrgQuota, setCreateOrgQuota] = useState<number>(100);
  const [isCreatingOrg, setIsCreatingOrg] = useState<boolean>(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  // Admin Management State
  const [admins, setAdmins] = useState<OrgAdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState<boolean>(false);
  const [assignEmail, setAssignEmail] = useState<string>("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) || null;
  const selectedTransferOrg = orgs.find((o) => o.id === transferOrgId) || (orgs.length > 0 ? orgs[0] : null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4500);
  };

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [orgsData, logsData, reqsData] = await Promise.all([
          fetchAdminOrgs().catch(() => []),
          fetchAuditLogs(undefined, 50).catch(() => []),
          fetchAdminWorkspaceRequests().catch(() => []),
        ]);
        setOrgs(orgsData);
        setAuditLogs(logsData);
        setWorkspaceRequests(reqsData);
      } catch (err: unknown) {
        console.error("Super Admin data load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      setLoadingAdmins(true);
      setAssignError(null);
      setAssignEmail("");
      fetchOrgAdmins(selectedOrgId)
        .then(setAdmins)
        .catch(() => setAdmins([]))
        .finally(() => setLoadingAdmins(false));
    } else {
      setAdmins([]);
      setAssignError(null);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    const targetId = transferOrgId || (orgs.length > 0 ? orgs[0].id : null);
    if (targetId) {
      setLoadingTransferAdmins(true);
      setChangeAdminError(null);
      fetchOrgAdmins(targetId)
        .then(setTransferAdmins)
        .catch(() => setTransferAdmins([]))
        .finally(() => setLoadingTransferAdmins(false));
    }
  }, [transferOrgId, orgs]);

  const handleAssignNewAdminInTransferTab = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = transferOrgId || (orgs.length > 0 ? orgs[0].id : null);
    if (!targetId || !newAdminEmail.trim()) return;
    setIsChangingAdmin(true);
    setChangeAdminError(null);
    try {
      const assigned = await assignOrgAdmin(targetId, newAdminEmail.trim());
      setTransferAdmins((prev) => {
        const existing = prev.find((a) => a.user_id === assigned.user_id);
        if (existing) {
          return prev.map((a) => (a.user_id === assigned.user_id ? assigned : a));
        }
        return [...prev, assigned];
      });
      setNewAdminEmail("");
      showNotification(`Designated "${assigned.email}" as Organisation Administrator.`);
      fetchAdminOrgs().then(setOrgs).catch(() => {});
      fetchAuditLogs(undefined, 50).then(setAuditLogs).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change organisation administrator";
      setChangeAdminError(msg);
    } finally {
      setIsChangingAdmin(false);
    }
  };

  const handleDemoteAdminInTransferTab = async (admin: OrgAdminUser) => {
    const targetId = transferOrgId || (orgs.length > 0 ? orgs[0].id : null);
    if (!targetId) return;
    if (transferAdmins.length <= 1) {
      showNotification("Cannot remove the last administrator of an active organisation.");
      return;
    }
    const confirmed = window.confirm(
      `Revoke administrator privileges for "${admin.email}"? Their role will be demoted to Analyst without deleting their account.`
    );
    if (!confirmed) return;

    try {
      await removeOrgAdmin(targetId, admin.user_id);
      setTransferAdmins((prev) => prev.filter((a) => a.user_id !== admin.user_id));
      showNotification(`Administrator privileges revoked for "${admin.email}". Role set to Analyst.`);
      fetchAdminOrgs().then(setOrgs).catch(() => {});
      fetchAuditLogs(undefined, 50).then(setAuditLogs).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke administrator privileges";
      showNotification(msg);
    }
  };

  const handleAssignAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !assignEmail.trim()) return;
    setAssignError(null);
    setIsAssigning(true);
    try {
      const assigned = await assignOrgAdmin(selectedOrgId, assignEmail.trim());
      setAdmins((prev) => {
        const existing = prev.find((a) => a.user_id === assigned.user_id);
        if (existing) {
          return prev.map((a) => (a.user_id === assigned.user_id ? assigned : a));
        }
        return [...prev, assigned];
      });
      setAssignEmail("");
      showNotification(`Assigned admin access to "${assigned.email}".`);
      fetchAdminOrgs().then(setOrgs).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to assign administrator";
      setAssignError(msg);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCreateOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createOrgName.trim() || !createOrgEmail.trim()) return;
    setIsCreatingOrg(true);
    setCreateOrgError(null);
    try {
      const created = await createAdminOrg({
        name: createOrgName.trim(),
        admin_email: createOrgEmail.trim(),
        admin_full_name: createOrgAdminName.trim() || undefined,
        monthly_lead_quota: createOrgQuota,
      });
      setOrgs((prev) => [created, ...prev]);
      showNotification(`Organisation "${created.name}" provisioned and assigned to admin "${createOrgEmail.trim()}".`);
      setShowCreateOrgModal(false);
      setCreateOrgName("");
      setCreateOrgEmail("");
      setCreateOrgAdminName("");
      setCreateOrgQuota(100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create organisation";
      setCreateOrgError(msg);
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleRemoveAdmin = async (admin: OrgAdminUser) => {
    if (!selectedOrgId) return;
    if (admins.length <= 1) {
      showNotification("Cannot remove the last administrator of an active organisation.");
      return;
    }
    const confirmed = window.confirm(
      `Revoke administrator privileges for "${admin.email}"? Their role will be demoted to Analyst without deleting their account.`
    );
    if (!confirmed) return;

    setRemovingUserId(admin.user_id);
    try {
      await removeOrgAdmin(selectedOrgId, admin.user_id);
      setAdmins((prev) => prev.filter((a) => a.user_id !== admin.user_id));
      showNotification(`Administrator privileges revoked for "${admin.email}". Role set to Analyst.`);
      fetchAdminOrgs().then(setOrgs).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove administrator";
      showNotification(msg);
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleToggleOrgStatus = async (org: AdminOrgItem) => {
    const nextStatus = !org.is_active;
    setUpdatingOrgId(org.id);
    try {
      const updated = await updateAdminOrg(org.id, { is_active: nextStatus });
      setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      showNotification(
        nextStatus
          ? `Organization "${org.name}" reactivated.`
          : `Organization "${org.name}" suspended. Authentication blocked per DPA.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update organization status";
      showNotification(msg);
    } finally {
      setUpdatingOrgId(null);
    }
  };

  const handleToggleOperator = async (org: AdminOrgItem) => {
    const nextOperator = !org.operator_enabled;
    setUpdatingOrgId(org.id);
    try {
      const updated = await updateAdminOrg(org.id, { operator_enabled: nextOperator });
      setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      showNotification(`Operator pipeline for "${org.name}" set to ${nextOperator ? "Enabled" : "Disabled"}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle operator";
      showNotification(msg);
    } finally {
      setUpdatingOrgId(null);
    }
  };

  const handleAdjustQuota = async (org: AdminOrgItem, delta: number) => {
    const nextQuota = Math.max(10, Math.min(2000, org.monthly_lead_quota + delta));
    setUpdatingOrgId(org.id);
    try {
      const updated = await updateAdminOrg(org.id, { monthly_lead_quota: nextQuota });
      setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      showNotification(`Monthly quota for "${org.name}" set to ${nextQuota} leads.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update quota";
      showNotification(msg);
    } finally {
      setUpdatingOrgId(null);
    }
  };

  const handleApproveWorkspace = async (req: WorkspaceRequestItem) => {
    setActioningRequestId(req.id);
    try {
      const updated = await approveWorkspaceRequest(req.id);
      setWorkspaceRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      showNotification(`Workspace "${req.proposed_name}" approved! Organization and Owner access provisioned.`);
      fetchAdminOrgs().then(setOrgs).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve workspace";
      showNotification(msg);
    } finally {
      setActioningRequestId(null);
    }
  };

  const handleRejectWorkspace = async (req: WorkspaceRequestItem) => {
    const reason = rejectReasonInput[req.id]?.trim() || "Workspace creation request declined by Super Admin.";
    setActioningRequestId(req.id);
    try {
      const updated = await rejectWorkspaceRequest(req.id, reason);
      setWorkspaceRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      showNotification(`Workspace request for "${req.proposed_name}" rejected.`);
      setRejectingRequestId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject workspace";
      showNotification(msg);
    } finally {
      setActioningRequestId(null);
    }
  };

  const handleRefreshWorkspaceRequests = async () => {
    try {
      setLoadingRequests(true);
      const data = await fetchAdminWorkspaceRequests();
      setWorkspaceRequests(data);
      showNotification("Workspace requests refreshed.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to refresh workspace requests";
      showNotification(msg);
    } finally {
      setLoadingRequests(false);
    }
  };

  const totalLeads = orgs.reduce((acc, o) => acc + o.lead_count, 0);
  const totalUsers = orgs.reduce((acc, o) => acc + o.user_count, 0);
  const activeOrgsCount = orgs.filter((o) => o.is_active).length;

  return (
    <div className="space-y-8">
      {/* Floating Notification */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 max-w-sm sm:max-w-md p-4 rounded-2xl text-xs font-semibold bg-rose-50/95 dark:bg-rose-950/95 border border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-200 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0"></span>
            <span className="leading-snug">{notification}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-rose-700 dark:text-rose-300 hover:text-rose-950 dark:hover:text-white font-bold text-base px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Super Admin Control Header */}
      <div className="glass-panel rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-lilac-500 animate-pulse"></span>
              <h2 className="text-xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                Super Admin Multi-Tenant Oversight
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-obsidian-700">
                System Superuser
              </span>
            </div>
            <p className="text-obsidian/70 dark:text-cosmic-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Global tenant lifecycle management, operator pipeline switches, monthly quotas, and immutable compliance audit logs.
            </p>
          </div>

          {/* Sub-tab view switch */}
          <div className="flex items-center space-x-1.5 bg-cosmic-100 dark:bg-obsidian-800 p-1 rounded-2xl border border-cosmic-300 dark:border-obsidian-700 text-xs">
            <button
              type="button"
              onClick={() => setActiveSubTab("orgs")}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition ${
                activeSubTab === "orgs"
                  ? "btn-obsidian"
                  : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
              }`}
            >
              Organizations ({orgs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("requests")}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                activeSubTab === "requests"
                  ? "btn-obsidian"
                  : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
              }`}
            >
              <span>Workspace Requests</span>
              {workspaceRequests.filter((r) => r.status === "pending").length > 0 && (
                <span className="w-2 h-2 rounded-full bg-lilac-500 animate-pulse"></span>
              )}
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cosmic-200 dark:bg-obsidian-700">
                {workspaceRequests.filter((r) => r.status === "pending").length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("admin_transfers")}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                activeSubTab === "admin_transfers"
                  ? "btn-obsidian"
                  : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
              }`}
            >
              <span>Change in Org Admin</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("audit")}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition ${
                activeSubTab === "audit"
                  ? "btn-obsidian"
                  : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
              }`}
            >
              Audit Trail ({auditLogs.length})
            </button>
          </div>
        </div>

        {/* System Capacity Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-cosmic-200/80 dark:border-obsidian-800">
          <div className="card-nested p-4 rounded-2xl">
            <div className="text-[10px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold">
              Active Tenants
            </div>
            <div className="text-2xl font-extrabold text-obsidian dark:text-cosmic-100 mt-1">
              {activeOrgsCount} <span className="text-xs font-normal text-obsidian/50">/ {orgs.length} total</span>
            </div>
          </div>

          <div className="card-nested p-4 rounded-2xl">
            <div className="text-[10px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold">
              Total Prospects
            </div>
            <div className="text-2xl font-extrabold text-obsidian dark:text-cosmic-100 mt-1">
              {totalLeads}
            </div>
          </div>

          <div className="card-nested p-4 rounded-2xl">
            <div className="text-[10px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold">
              Registered Users
            </div>
            <div className="text-2xl font-extrabold text-obsidian dark:text-cosmic-100 mt-1">
              {totalUsers}
            </div>
          </div>
        </div>
      </div>

      {/* VIEW A: Organizations Table */}
      {activeSubTab === "orgs" && (
        <div className="glass-panel rounded-3xl overflow-hidden border border-blush-200/80 dark:border-obsidian-700 shadow-sm dark:bg-obsidian-900/90">
          <div className="p-5 sm:p-6 border-b border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                Tenant Organizations & Quota Controls
              </h3>
              <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                Suspend/reactivate organizations, toggle operator pipeline runs, and tune monthly discovery allotments.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateOrgError(null);
                setShowCreateOrgModal(true);
              }}
              className="btn-obsidian px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span className="text-sm font-bold">+</span>
              <span>Add Organisation</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-cosmic-100/90 dark:bg-obsidian-800 text-obsidian/60 dark:text-cosmic-400 uppercase font-mono text-[10px] border-b border-cosmic-200 dark:border-obsidian-700">
                <tr>
                  <th className="py-3 px-5 font-semibold">Organization</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Operator Pipeline</th>
                  <th className="py-3 px-4 font-semibold">Monthly Lead Quota</th>
                  <th className="py-3 px-4 font-semibold text-center">Users</th>
                  <th className="py-3 px-4 font-semibold text-center">Leads</th>
                  <th className="py-3 px-5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cosmic-200 dark:divide-obsidian-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-obsidian/50 dark:text-cosmic-400">
                      Loading organizations...
                    </td>
                  </tr>
                ) : orgs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-obsidian/50 dark:text-cosmic-400">
                      No organizations found.
                    </td>
                  </tr>
                ) : (
                  orgs.map((org) => {
                    const isUpdating = updatingOrgId === org.id;

                    return (
                      <tr key={org.id} className="hover:bg-cosmic-100/60 dark:hover:bg-obsidian-800/60 transition">
                        <td
                          className="py-3.5 px-5 cursor-pointer group"
                          onClick={() => setSelectedOrgId(org.id)}
                          title="Click to view full organization details"
                        >
                          <div className="font-bold text-obsidian dark:text-cosmic-100 group-hover:text-lilac-600 dark:group-hover:text-lilac-400 transition flex items-center gap-1.5">
                            <span>{org.name}</span>
                            <span className="text-[10px] text-lilac-500 opacity-0 group-hover:opacity-100 transition">🔍 View</span>
                          </div>
                          <div className="text-[11px] font-mono text-obsidian/50 dark:text-cosmic-400">slug: {org.slug}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                              org.is_active
                                ? "bg-emerald-50 dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                : "bg-rose-50 dark:bg-obsidian-900 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                            }`}
                          >
                            {org.is_active ? "Active" : "Suspended"}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleToggleOperator(org)}
                            className={`text-xs font-semibold px-3 py-1 rounded-xl transition border cursor-pointer ${
                              org.operator_enabled
                                ? "bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-obsidian-700"
                                : "bg-amber-50 dark:bg-obsidian-800 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-obsidian-700"
                            }`}
                          >
                            {org.operator_enabled ? "Enabled ✓" : "Disabled ✕"}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleAdjustQuota(org, -25)}
                              className="w-5 h-5 rounded-md bg-cosmic-200 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-300 dark:hover:bg-obsidian-700 flex items-center justify-center font-bold text-xs border border-cosmic-300 dark:border-obsidian-700 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-mono text-xs font-bold px-1 text-obsidian dark:text-cosmic-100">
                              {org.monthly_lead_quota}
                            </span>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleAdjustQuota(org, 25)}
                              className="w-5 h-5 rounded-md bg-cosmic-200 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-300 dark:hover:bg-obsidian-700 flex items-center justify-center font-bold text-xs border border-cosmic-300 dark:border-obsidian-700 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono text-obsidian dark:text-cosmic-200">
                          {org.user_count}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono text-obsidian dark:text-cosmic-200">
                          {org.lead_count}
                        </td>

                        <td className="py-3.5 px-5 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              type="button"
                              onClick={() => setSelectedOrgId(org.id)}
                              className="text-xs font-semibold px-2.5 py-1 rounded-xl transition bg-cosmic-200/80 hover:bg-cosmic-300 text-obsidian dark:bg-obsidian-800 dark:hover:bg-obsidian-700 dark:text-cosmic-200 border border-cosmic-300 dark:border-obsidian-700 cursor-pointer"
                            >
                              View Details
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleToggleOrgStatus(org)}
                              className={`text-xs font-semibold px-3 py-1 rounded-xl transition cursor-pointer ${
                                org.is_active
                                  ? "bg-rose-50 dark:bg-obsidian-800 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100"
                                  : "bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                              }`}
                            >
                              {org.is_active ? "Suspend Org" : "Reactivate Org"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW B: Workspace Requests Table */}
      {activeSubTab === "requests" && (
        <div className="glass-panel rounded-3xl overflow-hidden border border-blush-200/80 dark:border-obsidian-700 shadow-sm dark:bg-obsidian-900/90">
          <div className="p-5 sm:p-6 border-b border-cosmic-200 dark:border-obsidian-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                  Workspace Provisioning Requests
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-obsidian-700">
                  {workspaceRequests.filter((r) => r.status === "pending").length} Pending
                </span>
              </div>
              <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                Review and approve or reject user requests to provision new tenant organizations. Automatic canonical duplicate matching flags existing names.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefreshWorkspaceRequests}
              disabled={loadingRequests}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-cosmic-100/80 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-200 transition cursor-pointer"
            >
              {loadingRequests ? "Refreshing..." : "↻ Refresh Requests"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-cosmic-100/90 dark:bg-obsidian-800 text-obsidian/60 dark:text-cosmic-400 uppercase font-mono text-[10px] border-b border-cosmic-200 dark:border-obsidian-700">
                <tr>
                  <th className="py-3 px-5 font-semibold">Requester</th>
                  <th className="py-3 px-4 font-semibold">Proposed Workspace Name</th>
                  <th className="py-3 px-4 font-semibold">Duplicate Check</th>
                  <th className="py-3 px-4 font-semibold">Submitted (UTC)</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cosmic-200 dark:divide-obsidian-800">
                {loadingRequests ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-obsidian/50 dark:text-cosmic-400">
                      Loading workspace requests...
                    </td>
                  </tr>
                ) : workspaceRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-obsidian/50 dark:text-cosmic-400">
                      No workspace creation requests submitted yet.
                    </td>
                  </tr>
                ) : (
                  workspaceRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-cosmic-100/60 dark:hover:bg-obsidian-800/60 transition">
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-obsidian dark:text-cosmic-100">{req.user_full_name}</div>
                        <div className="text-[11px] font-mono text-obsidian/60 dark:text-cosmic-400">{req.user_email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-obsidian dark:text-cosmic-100">{req.proposed_name}</div>
                        <div className="text-[10px] font-mono text-obsidian/50 dark:text-cosmic-400">Key: {req.normalized_name}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        {req.duplicate_warning ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            ⚠️ Existing Match
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            ✓ Unique Name
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-obsidian/60 dark:text-cosmic-400">
                        {new Date(req.created_at).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                            req.status === "approved"
                              ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                              : req.status === "rejected"
                              ? "bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                              : "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        {req.status === "pending" ? (
                          rejectingRequestId === req.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="text"
                                placeholder="Rejection reason..."
                                value={rejectReasonInput[req.id] || ""}
                                onChange={(e) =>
                                  setRejectReasonInput((prev) => ({ ...prev, [req.id]: e.target.value }))
                                }
                                className="text-xs px-2 py-1 rounded-lg border border-cosmic-300 dark:border-obsidian-700 bg-white dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 w-44"
                              />
                              <button
                                type="button"
                                disabled={actioningRequestId === req.id}
                                onClick={() => handleRejectWorkspace(req)}
                                className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectingRequestId(null)}
                                className="px-2 py-1 rounded-lg border border-cosmic-300 dark:border-obsidian-700 text-xs font-semibold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={actioningRequestId === req.id}
                                onClick={() => handleApproveWorkspace(req)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                {actioningRequestId === req.id ? "Approving..." : "Approve Workspace"}
                              </button>
                              <button
                                type="button"
                                disabled={actioningRequestId === req.id}
                                onClick={() => setRejectingRequestId(req.id)}
                                className="px-2.5 py-1.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-semibold text-xs transition cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          )
                        ) : req.status === "approved" ? (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ Organization Provisioned
                          </div>
                        ) : (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium truncate max-w-xs" title={req.rejection_reason || undefined}>
                            ✕ {req.rejection_reason || "Rejected"}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: Org Admin Changes & Transfers */}
      {activeSubTab === "admin_transfers" && (
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl overflow-hidden border border-blush-200/80 dark:border-obsidian-700 shadow-sm dark:bg-obsidian-900/90 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-cosmic-200 dark:border-obsidian-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-lilac-500 animate-pulse"></span>
                  <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                    Change in Org Admin & Role Transfers
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 font-bold border border-lilac-200 dark:border-obsidian-700">
                    Dedicated Admin Controls
                  </span>
                </div>
                <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1 max-w-2xl">
                  Super Admin portal to review, approve, reassign, or revoke Organisation Administrator privileges across all tenant organisations with automatic last-admin safety guards and immutable audit logging.
                </p>
              </div>

              {/* Organization Picker Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-mono uppercase text-obsidian/60 dark:text-cosmic-400 font-bold whitespace-nowrap">
                  Organisation:
                </label>
                <select
                  value={transferOrgId}
                  onChange={(e) => setTransferOrgId(e.target.value)}
                  className="text-xs px-3 py-2 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 font-semibold focus:outline-none focus:ring-2 focus:ring-lilac-400 cursor-pointer"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.slug})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Org Context Ribbon */}
            {selectedTransferOrg && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5 p-4 rounded-2xl bg-cosmic-100/70 dark:bg-obsidian-800/60 border border-cosmic-200 dark:border-obsidian-700 text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase text-obsidian/50 dark:text-cosmic-400 block font-bold">Organisation</span>
                  <span className="font-bold text-obsidian dark:text-cosmic-100 text-sm truncate block">{selectedTransferOrg.name}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-obsidian/50 dark:text-cosmic-400 block font-bold">Status</span>
                  <span className={`inline-block font-mono text-[10px] px-2 py-0.5 rounded-full font-bold uppercase mt-0.5 ${
                    selectedTransferOrg.is_active ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800" : "text-rose-700 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800"
                  }`}>
                    {selectedTransferOrg.is_active ? "Active" : "Suspended"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-obsidian/50 dark:text-cosmic-400 block font-bold">Active Administrators</span>
                  <span className="font-bold text-obsidian dark:text-cosmic-100 font-mono">{transferAdmins.length} Admins</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-obsidian/50 dark:text-cosmic-400 block font-bold">Enrolled Users</span>
                  <span className="font-bold text-obsidian dark:text-cosmic-100 font-mono">{selectedTransferOrg.user_count} Users</span>
                </div>
              </div>
            )}

            {/* Two Column Layout: Current Admins | Change / Assign Admin */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              {/* Left Column (7 cols): Current Administrators Table */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-obsidian/70 dark:text-cosmic-300">
                    Current Organisation Administrators
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    ✓ Last-Admin Guard Protected
                  </span>
                </div>

                {loadingTransferAdmins ? (
                  <div className="py-8 text-center text-xs text-obsidian/50 dark:text-cosmic-400">
                    Loading administrators...
                  </div>
                ) : transferAdmins.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                    No administrators currently assigned. Designate an administrator using the form on the right.
                  </div>
                ) : (
                  <div className="divide-y divide-cosmic-200 dark:divide-obsidian-800 border border-cosmic-200 dark:border-obsidian-800 rounded-2xl overflow-hidden bg-white/40 dark:bg-obsidian-950/40">
                    {transferAdmins.map((adm) => (
                      <div key={adm.user_id} className="p-3.5 sm:px-4 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-obsidian text-white dark:bg-cosmic-100 dark:text-obsidian flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
                            {adm.full_name?.charAt(0) || adm.email.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-obsidian dark:text-cosmic-100 truncate">
                              {adm.full_name || "LeadFlow User"}
                            </div>
                            <div className="text-[11px] font-mono text-obsidian/60 dark:text-cosmic-400 truncate">
                              {adm.email}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                            adm.role === "owner"
                              ? "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                              : "bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-obsidian-700"
                          }`}>
                            {adm.role}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleDemoteAdminInTransferTab(adm)}
                            className="px-2.5 py-1 rounded-xl text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 transition cursor-pointer"
                            title="Demote to Analyst"
                          >
                            Revoke / Demote
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column (5 cols): Designate / Change Administrator Form */}
              <div className="lg:col-span-5 card-nested p-5 rounded-2xl border border-cosmic-200 dark:border-obsidian-700 space-y-3">
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-obsidian/70 dark:text-cosmic-300">
                    Designate / Change Org Admin
                  </h4>
                  <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                    Enter the registered email of the user to assign as an Organisation Administrator for this organisation.
                  </p>
                </div>

                {changeAdminError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
                    {changeAdminError}
                  </div>
                )}

                <form onSubmit={handleAssignNewAdminInTransferTab} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-obsidian/60 dark:text-cosmic-400 font-bold mb-1">
                      User Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="admin@example.com"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingAdmin || !newAdminEmail.trim()}
                    className="w-full btn-obsidian py-2 px-3 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-50"
                  >
                    {isChangingAdmin ? "Assigning..." : "Assign as Organisation Administrator"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Admin Role Mutation & Transfer Audit History Table */}
          <div className="glass-panel rounded-3xl overflow-hidden border border-blush-200/80 dark:border-obsidian-700 shadow-sm dark:bg-obsidian-900/90 p-5 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-cosmic-200 dark:border-obsidian-800">
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-obsidian dark:text-cosmic-100">
                  Admin Changes & Role Transfers History
                </h4>
                <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                  Platform-wide log of all administrator role transfers, promotions, and revocations.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cosmic-200 dark:bg-obsidian-700 text-obsidian/70 dark:text-cosmic-300 font-bold">
                {auditLogs.filter((l) => ["transfer_org_admin", "assign_org_admin", "remove_org_admin"].includes(l.action)).length} Recorded
              </span>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-cosmic-100/90 dark:bg-obsidian-800 text-obsidian/60 dark:text-cosmic-400 uppercase font-mono text-[10px] border-b border-cosmic-200 dark:border-obsidian-700">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3 font-semibold">Action</th>
                    <th className="py-2.5 px-4 font-semibold">Initiated By</th>
                    <th className="py-2.5 px-4 font-semibold">Target Admin</th>
                    <th className="py-2.5 px-4 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cosmic-200 dark:divide-obsidian-800">
                  {auditLogs.filter((l) => ["transfer_org_admin", "assign_org_admin", "remove_org_admin"].includes(l.action)).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-obsidian/50 dark:text-cosmic-400">
                        No administrator changes or role transfers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs
                      .filter((l) => ["transfer_org_admin", "assign_org_admin", "remove_org_admin"].includes(l.action))
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-cosmic-100/60 dark:hover:bg-obsidian-800/60 transition font-mono">
                          <td className="py-2.5 px-4 text-[11px] text-obsidian/70 dark:text-cosmic-300">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 border border-cosmic-200 dark:border-obsidian-700">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[11px] text-obsidian/80 dark:text-cosmic-200 font-sans">
                            {(log.details as Record<string, string>)?.transferred_by ||
                             (log.details as Record<string, string>)?.assigned_by ||
                             (log.details as Record<string, string>)?.removed_by ||
                             "Super Admin"}
                          </td>
                          <td className="py-2.5 px-4 text-[11px] text-obsidian/80 dark:text-cosmic-200 font-sans">
                            {(log.details as Record<string, string>)?.transferred_to ||
                             (log.details as Record<string, string>)?.target_email ||
                             (log.details as Record<string, string>)?.member_email ||
                             "-"}
                          </td>
                          <td className="py-2.5 px-4 text-[11px] text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
                            ✓ Applied
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW D: Audit Trail Viewer */}
      {activeSubTab === "audit" && (
        <div className="glass-panel rounded-3xl overflow-hidden border border-blush-200/80 dark:border-obsidian-700 shadow-sm dark:bg-obsidian-900/90">
          <div className="p-5 sm:p-6 border-b border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                Immutable Compliance Audit Trail (Section 4.3 & 17)
              </h3>
              <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                Every mutation, contact reveal, draft generation, CRM export, and admin modification is logged with IP address and timestamp.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-obsidian-700 font-bold">
              Retention: 12 Months
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-cosmic-100/90 dark:bg-obsidian-800 text-obsidian/60 dark:text-cosmic-400 uppercase font-mono text-[10px] border-b border-cosmic-200 dark:border-obsidian-700">
                <tr>
                  <th className="py-3 px-5 font-semibold">Timestamp (UTC)</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Entity</th>
                  <th className="py-3 px-4 font-semibold">Details</th>
                  <th className="py-3 px-5 font-semibold text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cosmic-200 dark:divide-obsidian-800">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-obsidian/50 dark:text-cosmic-400">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-cosmic-100/60 dark:hover:bg-obsidian-800/60 transition font-mono">
                      <td className="py-3 px-5 text-[11px] text-obsidian/70 dark:text-cosmic-300">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 border border-cosmic-200 dark:border-obsidian-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-obsidian/80 dark:text-cosmic-300">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ""}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-obsidian/60 dark:text-cosmic-400 font-sans max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </td>
                      <td className="py-3 px-5 text-right text-[11px] text-obsidian/50 dark:text-cosmic-400">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW C: Organization Details Modal Card */}
      {selectedOrg && (
        <div
          className="fixed inset-0 z-50 bg-obsidian-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedOrgId(null)}
        >
          <div
            className="glass-panel card-cosmic rounded-3xl p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blush-200 dark:border-obsidian-700 relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-cosmic-200 dark:border-obsidian-800">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                    {selectedOrg.name}
                  </h3>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                      selectedOrg.is_active
                        ? "bg-emerald-50 dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                        : "bg-rose-50 dark:bg-obsidian-900 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    {selectedOrg.is_active ? "Active" : "Suspended"}
                  </span>
                </div>
                <div className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1 flex flex-wrap items-center gap-2">
                  <span>Slug: <strong className="font-mono text-obsidian dark:text-cosmic-200">{selectedOrg.slug}</strong></span>
                  <span>•</span>
                  <span className="font-mono text-[11px] text-obsidian/50 dark:text-cosmic-400 truncate max-w-xs">ID: {selectedOrg.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrgId(null)}
                className="w-8 h-8 rounded-full bg-cosmic-200 hover:bg-cosmic-300 dark:bg-obsidian-800 dark:hover:bg-obsidian-700 text-obsidian dark:text-cosmic-200 flex items-center justify-center font-bold text-lg transition cursor-pointer"
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* 3 Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-5">
              <div className="card-nested p-4 rounded-2xl border border-cosmic-200 dark:border-obsidian-700">
                <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400">
                  Monthly Quota
                </div>
                <div className="text-2xl font-extrabold text-obsidian dark:text-cosmic-100 mt-1">
                  {selectedOrg.monthly_lead_quota}
                </div>
                <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">Leads / month</div>
              </div>

              <div className="card-nested p-4 rounded-2xl border border-cosmic-200 dark:border-obsidian-700">
                <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400">
                  Enrolled Users
                </div>
                <div className="text-2xl font-extrabold text-obsidian dark:text-cosmic-100 mt-1">
                  {selectedOrg.user_count}
                </div>
                <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">RBAC Members</div>
              </div>

              <div className="card-nested p-4 rounded-2xl border border-cosmic-200 dark:border-obsidian-700">
                <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400">
                  Discovered Leads
                </div>
                <div className="text-2xl font-extrabold text-obsidian dark:text-cosmic-100 mt-1">
                  {selectedOrg.lead_count}
                </div>
                <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">Scored Prospects</div>
              </div>
            </div>

            {/* Organisation Administrators Management Section (Feature 2) */}
            <div className="card-nested p-5 rounded-2xl border border-cosmic-200 dark:border-obsidian-700 mb-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-cosmic-200/80 dark:border-obsidian-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-lilac-500 animate-pulse"></span>
                    <h4 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                      Organisation Administrators
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 font-bold border border-lilac-200 dark:border-obsidian-700">
                      {admins.length} Active
                    </span>
                  </div>
                  <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                    View, assign, and revoke admin permissions. Last-admin guard prevents leaving the organisation without an admin.
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold flex items-center gap-1 self-start sm:self-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Last-Admin Guard Active
                </span>
              </div>

              {/* Admin List */}
              {loadingAdmins ? (
                <div className="py-6 text-center text-xs text-obsidian/50 dark:text-cosmic-400">
                  <span className="inline-block animate-spin h-4 w-4 border-2 border-obsidian dark:border-white border-t-transparent rounded-full mr-2"></span>
                  Loading administrators...
                </div>
              ) : admins.length === 0 ? (
                <div className="py-4 px-3 text-center text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900">
                  No administrators assigned yet. Assign an administrator below.
                </div>
              ) : (
                <div className="divide-y divide-cosmic-200/80 dark:divide-obsidian-800 border border-cosmic-200/80 dark:border-obsidian-800 rounded-xl overflow-hidden bg-white/40 dark:bg-obsidian-950/40">
                  {admins.map((adm) => (
                    <div key={adm.user_id} className="p-3 sm:px-4 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-obsidian text-white dark:bg-cosmic-100 dark:text-obsidian flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
                          {adm.full_name?.charAt(0) || adm.email.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-obsidian dark:text-cosmic-100 truncate">
                            {adm.full_name || "LeadFlow User"}
                          </div>
                          <div className="text-[11px] font-mono text-obsidian/60 dark:text-cosmic-400 truncate">
                            {adm.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                          adm.role === "owner"
                            ? "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                            : "bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-obsidian-700"
                        }`}>
                          {adm.role}
                        </span>

                        <button
                          type="button"
                          disabled={admins.length <= 1 || removingUserId === adm.user_id}
                          onClick={() => handleRemoveAdmin(adm)}
                          title={admins.length <= 1 ? "Cannot remove the only administrator of an active organisation" : "Revoke admin privileges"}
                          className={`text-xs px-2.5 py-1 rounded-xl font-semibold transition cursor-pointer ${
                            admins.length <= 1
                              ? "opacity-40 cursor-not-allowed bg-cosmic-200 dark:bg-obsidian-800 text-obsidian/40 dark:text-cosmic-500 border border-cosmic-300 dark:border-obsidian-700"
                              : "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/80"
                          }`}
                        >
                          {removingUserId === adm.user_id ? "Revoking..." : "Remove Admin"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Assign New Administrator Form */}
              <form onSubmit={handleAssignAdmin} className="space-y-2 pt-1">
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/70 dark:text-cosmic-300">
                  Assign Organisation Administrator by Email
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="user@example.com (must be a registered account)"
                    value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-cosmic-300 dark:border-obsidian-700 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-1 focus:ring-lilac-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isAssigning || !assignEmail.trim()}
                    className="btn-obsidian text-xs px-4 py-2 rounded-xl font-semibold disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    {isAssigning ? "Assigning..." : "Assign Admin"}
                  </button>
                </div>
                {assignError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 font-medium">
                    {assignError}
                  </div>
                )}
              </form>
            </div>

            {/* Operational Controls & Multi-Tenancy Specs */}
            <div className="space-y-3.5 text-xs">
              <div className="card-nested p-4 rounded-2xl border border-cosmic-200 dark:border-obsidian-700 space-y-3">
                <div className="text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/70 dark:text-cosmic-300">
                  Tenant Configuration & Live Controls
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-cosmic-200/60 dark:border-obsidian-700">
                  <div>
                    <div className="font-bold text-obsidian dark:text-cosmic-100">Operator Lead Pipeline</div>
                    <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400">Allow autonomous background discovery runs</div>
                  </div>
                  <button
                    type="button"
                    disabled={updatingOrgId === selectedOrg.id}
                    onClick={() => handleToggleOperator(selectedOrg)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition border cursor-pointer ${
                      selectedOrg.operator_enabled
                        ? "bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-obsidian-700"
                        : "bg-amber-50 dark:bg-obsidian-800 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-obsidian-700"
                    }`}
                  >
                    {selectedOrg.operator_enabled ? "Pipeline Enabled ✓" : "Pipeline Disabled ✕"}
                  </button>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-cosmic-200/60 dark:border-obsidian-700">
                  <div>
                    <div className="font-bold text-obsidian dark:text-cosmic-100">Organization Quota Tuning</div>
                    <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400">Adjust monthly cap for zero-cost discovery</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={updatingOrgId === selectedOrg.id}
                      onClick={() => handleAdjustQuota(selectedOrg, -50)}
                      className="px-2.5 py-1 rounded-xl bg-cosmic-200 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 font-bold border border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-300 cursor-pointer"
                    >
                      -50
                    </button>
                    <span className="font-mono font-bold text-obsidian dark:text-cosmic-100 px-1">
                      {selectedOrg.monthly_lead_quota}
                    </span>
                    <button
                      type="button"
                      disabled={updatingOrgId === selectedOrg.id}
                      onClick={() => handleAdjustQuota(selectedOrg, 50)}
                      className="px-2.5 py-1 rounded-xl bg-cosmic-200 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 font-bold border border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-300 cursor-pointer"
                    >
                      +50
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <div>
                    <div className="font-bold text-obsidian dark:text-cosmic-100">Tenant Account Lifecycle</div>
                    <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400">Suspension immediately terminates JWT sessions & API access</div>
                  </div>
                  <button
                    type="button"
                    disabled={updatingOrgId === selectedOrg.id}
                    onClick={() => handleToggleOrgStatus(selectedOrg)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer ${
                      selectedOrg.is_active
                        ? "bg-rose-50 dark:bg-obsidian-800 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100"
                        : "bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    {selectedOrg.is_active ? "Suspend Organization" : "Reactivate Organization"}
                  </button>
                </div>
              </div>

              {/* Security & Multi-tenancy Architecture info */}
              <div className="p-3.5 rounded-2xl bg-lilac-50/60 dark:bg-obsidian-800/80 border border-lilac-200/60 dark:border-obsidian-700 text-[11px] text-obsidian/70 dark:text-cosmic-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>PostgreSQL Row-Level Security: <strong>FORCE ROW LEVEL SECURITY</strong> on <code>org_id</code></span>
                </div>
                <span className="font-mono text-[10px] text-obsidian/50 dark:text-cosmic-400">Isolated Tenant Boundary</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 pt-4 border-t border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  switchOrganization(selectedOrg.id);
                  showNotification(`Switched active context to "${selectedOrg.name}".`);
                  setSelectedOrgId(null);
                }}
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-lilac-600 hover:bg-lilac-700 text-white transition flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>Switch to this Org Context</span>
                <span>→</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOrgId(null)}
                className="px-4 py-2 rounded-xl btn-obsidian text-xs font-semibold cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Super Admin Add Organisation & Assign Admin */}
      {showCreateOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg p-6 sm:p-7 rounded-3xl bg-[#0D0D12] dark:bg-[#FAF7F2] border border-obsidian-700 dark:border-cosmic-300 shadow-2xl text-cosmic-100 dark:text-obsidian max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowCreateOrgModal(false)}
              className="absolute top-4 right-4 p-1 rounded-xl text-cosmic-400 dark:text-obsidian/50 hover:bg-obsidian-800 dark:hover:bg-cosmic-200 transition cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-lilac-950/80 text-lilac-400 dark:bg-lilac-100 dark:text-lilac-800 flex items-center justify-center font-bold text-lg border border-lilac-800/60 dark:border-lilac-300">
                🏢
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-white dark:text-obsidian">
                  Add Organisation to Platform
                </h2>
                <p className="text-xs text-cosmic-400 dark:text-obsidian/60">
                  Provision a new tenant boundary and designate its primary Organisation Administrator.
                </p>
              </div>
            </div>

            {createOrgError && (
              <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-xs text-rose-950 dark:text-rose-200 font-medium">
                {createOrgError}
              </div>
            )}

            <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60 mb-1">
                  Tenant Organisation Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createOrgName}
                  onChange={(e) => setCreateOrgName(e.target.value)}
                  placeholder="e.g. Acme Health Systems"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-obsidian-800 dark:bg-white border border-obsidian-700 dark:border-cosmic-300 text-white dark:text-obsidian focus:outline-none focus:ring-2 focus:ring-lilac-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60 mb-1">
                  Organisation Admin Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createOrgEmail}
                  onChange={(e) => setCreateOrgEmail(e.target.value)}
                  placeholder="e.g. admin@acmehealth.com"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-obsidian-800 dark:bg-white border border-obsidian-700 dark:border-cosmic-300 text-white dark:text-obsidian focus:outline-none focus:ring-2 focus:ring-lilac-500"
                />
                <p className="text-[10px] text-cosmic-500 dark:text-obsidian/50 mt-1">
                  If this user already has an account, they will be assigned as Owner. If new, an account will be created.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60 mb-1">
                  Admin Full Name (Optional)
                </label>
                <input
                  type="text"
                  value={createOrgAdminName}
                  onChange={(e) => setCreateOrgAdminName(e.target.value)}
                  placeholder="e.g. Dr. Sarah Jenkins"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-obsidian-800 dark:bg-white border border-obsidian-700 dark:border-cosmic-300 text-white dark:text-obsidian focus:outline-none focus:ring-2 focus:ring-lilac-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60 mb-1">
                  Monthly Lead Discovery Quota
                </label>
                <input
                  type="number"
                  min={10}
                  max={50000}
                  value={createOrgQuota}
                  onChange={(e) => setCreateOrgQuota(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-obsidian-800 dark:bg-white border border-obsidian-700 dark:border-cosmic-300 text-white dark:text-obsidian focus:outline-none focus:ring-2 focus:ring-lilac-500"
                />
                <p className="text-[10px] text-cosmic-500 dark:text-obsidian/50 mt-1">
                  Initial monthly lead limit enforced for this tenant boundary.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-obsidian-800 dark:border-cosmic-200">
                <button
                  type="button"
                  onClick={() => setShowCreateOrgModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-cosmic-400 dark:text-obsidian/60 hover:bg-obsidian-800 dark:hover:bg-cosmic-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingOrg || !createOrgName.trim() || !createOrgEmail.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-lilac-600 hover:bg-lilac-700 text-white disabled:opacity-50 transition cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  {isCreatingOrg ? (
                    <>
                      <span className="inline-block animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                      <span>Provisioning...</span>
                    </>
                  ) : (
                    <span>Create Organisation & Assign Admin</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
