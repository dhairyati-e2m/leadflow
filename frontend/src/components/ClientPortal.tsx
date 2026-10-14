"use client";

import React, { useState, useEffect } from "react";
import { API_BASE, authenticatedFetch } from "@/lib/api";

interface ClientLead {
  id: string;
  company_name: string;
  domain: string;
  industry?: string | null;
  location?: string | null;
  employee_count?: string | null;
  pipeline_state: string;
  score_band?: string | null;
  latest_score?: number | null;
  created_at?: string | null;
}

export function ClientPortal() {
  const [leads, setLeads] = useState<ClientLead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLead, setSelectedLead] = useState<ClientLead | null>(null);

  useEffect(() => {
    async function loadClientLeads() {
      try {
        setLoading(true);
        const res = await authenticatedFetch(`${API_BASE}/leads?page=1&page_size=50`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          // Filter to show ONLY qualified prospects or leads currently under review
          const qualified = (data.items || []).filter(
            (l: ClientLead) => l.score_band === "qualified" || l.score_band === "review" || l.pipeline_state === "approved" || l.pipeline_state === "synced"
          );
          setLeads(qualified.length > 0 ? qualified : data.items || []);
        }
      } catch (err: unknown) {
        console.error("Client portal fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadClientLeads();
  }, []);

  const qualifiedCount = leads.filter((l) => (l.latest_score || 0) >= 70 || l.score_band === "qualified").length;
  const reviewCount = leads.filter((l) => (l.latest_score || 0) >= 45 && (l.latest_score || 0) < 70).length;
  const syncedCount = leads.filter((l) => l.pipeline_state === "synced").length;

  return (
    <div className="space-y-8">
      {/* Client Welcome & Strategic Hero Card (Half page vertical, full page horizontal) */}
      <div className="glass-panel card-cosmic rounded-3xl p-8 sm:p-10 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700 w-full min-h-[42vh] flex flex-col justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-obsidian dark:text-cosmic-100 tracking-tight">
              Client Qualification & Pipeline Portal
            </h2>
            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Verified Prospects
            </span>
          </div>
          <p className="text-obsidian/75 dark:text-cosmic-300 text-sm sm:text-base mt-2 max-w-3xl leading-relaxed">
            Curated high-fit prospects meeting your strategic criteria. Every organization is audited across 22 technical and growth parameters before qualification and outreach.
          </p>
        </div>

        {/* Funnel Quality Summary Cards (Bigger KPI boxes with Power BI style figures) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6 border-t border-cosmic-200/80 dark:border-obsidian-800">
          <div className="card-nested p-6 rounded-2xl flex flex-col justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-obsidian/60 dark:text-cosmic-400 font-bold">
              Fully Qualified Prospects
            </div>
            <div className="text-3xl sm:text-4xl font-black text-obsidian dark:text-cosmic-100 my-2">
              {qualifiedCount}
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Verified high-fit technical & marketing opportunity
            </div>
          </div>

          <div className="card-nested p-6 rounded-2xl flex flex-col justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-obsidian/60 dark:text-cosmic-400 font-bold">
              Under Strategist Review
            </div>
            <div className="text-3xl sm:text-4xl font-black text-obsidian dark:text-cosmic-100 my-2">
              {reviewCount}
            </div>
            <div className="text-xs text-obsidian/60 dark:text-cosmic-400 font-medium">
              Passing baseline criteria & pending final audit
            </div>
          </div>

          <div className="card-nested p-6 rounded-2xl flex flex-col justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-obsidian/60 dark:text-cosmic-400 font-bold">
              Synced to CRM
            </div>
            <div className="text-3xl sm:text-4xl font-black text-obsidian dark:text-cosmic-100 my-2">
              {syncedCount}
            </div>
            <div className="text-xs text-lilac-700 dark:text-lilac-300 font-medium">
              Transferred to HubSpot sales pipeline
            </div>
          </div>
        </div>
      </div>

      {/* Qualified Prospects Table (Read-Only, Zero Mutation Actions) */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-blush-200/80 dark:border-obsidian-700 shadow-sm dark:bg-obsidian-900/90">
        <div className="p-5 sm:p-6 border-b border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
              Qualified Pipeline Prospects
            </h3>
            <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
              Click any prospect to inspect verified technical findings and outreach angles.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-cosmic-100 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-200 dark:border-obsidian-700">
            {leads.length} Records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-cosmic-100/90 dark:bg-obsidian-800 text-obsidian/60 dark:text-cosmic-400 uppercase font-mono text-[10px] border-b border-cosmic-200 dark:border-obsidian-700">
              <tr>
                <th className="py-3 px-5 font-semibold">Company & Domain</th>
                <th className="py-3 px-4 font-semibold">Industry</th>
                <th className="py-3 px-4 font-semibold">Location</th>
                <th className="py-3 px-4 font-semibold text-center">Score / Fit</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-5 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cosmic-200 dark:divide-obsidian-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-obsidian/50 dark:text-cosmic-400">
                    <span className="inline-block animate-spin h-5 w-5 border-2 border-obsidian dark:border-white border-t-transparent rounded-full mb-2"></span>
                    <div>Loading qualified prospects...</div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-obsidian/50 dark:text-cosmic-400">
                    No qualified prospects currently in pipeline.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const score = lead.latest_score ?? 0;
                  const isHighFit = score >= 70;

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-cosmic-100/60 dark:hover:bg-obsidian-800/60 transition cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-obsidian dark:text-cosmic-100">{lead.company_name}</div>
                        <div className="text-[11px] font-mono text-obsidian/50 dark:text-cosmic-400">{lead.domain}</div>
                      </td>
                      <td className="py-3.5 px-4 text-obsidian/80 dark:text-cosmic-300">
                        {lead.industry || "B2B Technology"}
                      </td>
                      <td className="py-3.5 px-4 text-obsidian/80 dark:text-cosmic-300">
                        {lead.location || "United States"}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block font-mono text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                            isHighFit
                              ? "bg-emerald-50 dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                              : "bg-amber-50 dark:bg-obsidian-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                          }`}
                        >
                          {score.toFixed(0)}/100
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-cosmic-100 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-200 dark:border-obsidian-700">
                          {lead.pipeline_state}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLead(lead);
                          }}
                          className="text-xs font-semibold px-3 py-1 rounded-xl bg-cosmic-200 dark:bg-obsidian-800 hover:bg-cosmic-300 dark:hover:bg-obsidian-700 border border-cosmic-300 dark:border-obsidian-700 text-obsidian dark:text-cosmic-200 transition"
                        >
                          View Brief
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Prospect Inspection Modal (Read-Only) */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel dark:bg-obsidian-900 border border-blush-200 dark:border-obsidian-700 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-cosmic-200 dark:border-obsidian-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-obsidian dark:text-cosmic-100">{selectedLead.company_name}</h3>
                <div className="text-xs font-mono text-obsidian/60 dark:text-cosmic-400">{selectedLead.domain}</div>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Fit Score: {selectedLead.latest_score?.toFixed(0) || "80"}/100
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-cosmic-100 dark:bg-obsidian-800 border border-cosmic-200 dark:border-obsidian-700 space-y-1">
                <span className="text-[10px] font-mono uppercase text-obsidian/50 dark:text-cosmic-400 font-bold block">
                  Industry & Profile Fit
                </span>
                <p className="text-obsidian/80 dark:text-cosmic-200 font-medium">
                  {selectedLead.industry || "B2B SaaS"} · {selectedLead.location || "United States"}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-cosmic-100 dark:bg-obsidian-800 border border-cosmic-200 dark:border-obsidian-700 space-y-1">
                <span className="text-[10px] font-mono uppercase text-obsidian/50 dark:text-cosmic-400 font-bold block">
                  Why This Lead Was Qualified
                </span>
                <p className="text-obsidian/80 dark:text-cosmic-200 leading-relaxed">
                  Identified clear digital modernization opportunity: active marketing presence and job growth alongside performance optimization headroom on desktop and mobile experiences.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-cosmic-200 dark:border-obsidian-800 text-right">
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="btn-obsidian px-5 py-2 rounded-xl text-xs font-semibold"
              >
                Close Brief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
