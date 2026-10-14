"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  AdminOrgItem,
  AuditLogItem,
  fetchAdminOrgs,
  updateAdminOrg,
  fetchAuditLogs,
} from "@/lib/api";

export function SuperAdminPortal() {
  const { switchOrganization } = useAuth();
  const [orgs, setOrgs] = useState<AdminOrgItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingOrgId, setUpdatingOrgId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"orgs" | "audit">("orgs");

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) || null;

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
        const [orgsData, logsData] = await Promise.all([
          fetchAdminOrgs().catch(() => []),
          fetchAuditLogs(undefined, 50).catch(() => []),
        ]);
        setOrgs(orgsData);
        setAuditLogs(logsData);
      } catch (err: unknown) {
        console.error("Super Admin data load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

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

      {/* VIEW B: Audit Trail Viewer */}
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
            className="glass-panel card-cosmic rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl border border-blush-200 dark:border-obsidian-700 relative text-left"
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
    </div>
  );
}
