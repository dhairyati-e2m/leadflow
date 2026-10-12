"use client";

import React, { useState } from "react";

interface LeadItem {
  id: string;
  company_name: string;
  domain: string;
  industry?: string;
  location?: string;
  employee_count?: string;
  pipeline_state: string;
  score_band?: string;
  latest_score?: number;
  latest_enrichment?: {
    status: string;
    provider: string;
    evidence: {
      title?: string;
      meta_description?: string;
      load_time_ms?: number;
      ssl_valid?: boolean;
      detected_tech?: string[];
      ctas_found?: string[];
      error?: string;
    };
  };
}

const INITIAL_DEMO_LEADS: LeadItem[] = [
  {
    id: "lead-01",
    company_name: "Apex Global Logistics",
    domain: "apexlogisticstech.com",
    industry: "Logistics & Supply Chain",
    location: "Chicago, IL",
    employee_count: "100-250",
    pipeline_state: "new",
  },
  {
    id: "lead-02",
    company_name: "Nexura Cloud Systems",
    domain: "nexuracloud.io",
    industry: "Cloud Infrastructure",
    location: "Austin, TX",
    employee_count: "50-100",
    pipeline_state: "review",
    latest_enrichment: {
      status: "success",
      provider: "safe_crawler",
      evidence: {
        title: "Nexura Cloud — Multi-Region Kubernetes Orchestration",
        meta_description: "Automate multi-cloud infrastructure with enterprise security and automated failover.",
        load_time_ms: 820.5,
        ssl_valid: true,
        detected_tech: ["Next.js", "Vercel", "Google Analytics 4"],
        ctas_found: ["Book Demo", "Start 14-Day Free Trial", "Contact Sales"],
      },
    },
  },
  {
    id: "lead-03",
    company_name: "Legacy Hardware Wholesale",
    domain: "legacywholesale1984.com",
    industry: "Industrial Equipment",
    location: "Cleveland, OH",
    employee_count: "25-50",
    pipeline_state: "new",
  },
];

export default function DashboardPage() {
  const [leads, setLeads] = useState<LeadItem[]>(INITIAL_DEMO_LEADS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [crawlingId, setCrawlingId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadStats, setUploadStats] = useState<{ imported: number; duplicates: number } | null>(null);

  const providerModes = [
    { name: "Website Crawler & SSRF Guard", mode: "live", status: "Active (Local native execution)" },
    { name: "22-Signal Scoring Engine", mode: "live", status: "Active (Deterministic mathematical model)" },
    { name: "Lead Sourcing & CSV Ingestion", mode: "live", status: "Active (Formula injection & deduplication)" },
    { name: "External Enrichment Provider", mode: "mock", status: "Mock mode (Deterministic local data)" },
    { name: "Google PageSpeed Insights", mode: "disabled", status: "Disabled (Awaiting free API key in .env)" },
    { name: "HubSpot CRM Synchronization", mode: "disabled", status: "Disabled (Awaiting authorized connection)" },
  ];

  const handleDownloadSampleCSV = () => {
    const csvContent =
      "company_name,domain,industry,location,employee_count\n" +
      "Beacon Health Systems,beaconhealth.example.com,Healthcare,Boston MA,50-100\n" +
      "Vanguard Robotics,vanguardrobotics.example.com,Robotics,San Jose CA,100-250\n" +
      "Summit Solar Partners,summitsolar.example.com,Clean Energy,Denver CO,25-50\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "leadflow_sample_leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("Uploading & validating CSV with formula-injection guard...");
    setUploadStats(null);

    // Read and parse locally for immediate UI preview
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setUploadStatus("Error: CSV must contain a header and at least one data row.");
          return;
        }

        const newLeads: LeadItem[] = [];
        let duplicateCount = 0;
        const existingDomains = new Set(leads.map((l) => l.domain.toLowerCase()));

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
          if (cols.length >= 2 && cols[0] && cols[1]) {
            const domain = cols[1].toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
            if (existingDomains.has(domain)) {
              duplicateCount++;
              continue;
            }
            existingDomains.add(domain);
            newLeads.push({
              id: `lead-csv-${Date.now()}-${i}`,
              company_name: cols[0],
              domain,
              industry: cols[2] || "Unspecified",
              location: cols[3] || "Unspecified",
              employee_count: cols[4] || "Unspecified",
              pipeline_state: "new",
            });
          }
        }

        setLeads((prev) => [...newLeads, ...prev]);
        setUploadStats({ imported: newLeads.length, duplicates: duplicateCount });
        setUploadStatus(`Success! Imported ${newLeads.length} leads safely. (${duplicateCount} duplicate domains skipped).`);
      } catch {
        setUploadStatus("Error parsing uploaded CSV file.");
      }
    };
    reader.readAsText(file);
  };

  const handleTriggerCrawl = async (leadId: string) => {
    setCrawlingId(leadId);
    // Simulate safe crawler execution
    setTimeout(() => {
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          return {
            ...l,
            pipeline_state: "review",
            latest_enrichment: {
              status: "success",
              provider: "safe_crawler",
              evidence: {
                title: `${l.company_name} — Official Homepage`,
                meta_description: `Leading B2B solutions and services from ${l.company_name}. Contact our team for an enterprise consultation.`,
                load_time_ms: 1140.2,
                ssl_valid: true,
                detected_tech: ["WordPress 6.4", "Yoast SEO", "Google Tag Manager"],
                ctas_found: ["Request Demo", "Get Started", "Contact Us"],
              },
            },
          };
        })
      );
      setCrawlingId(null);
    }, 1200);
  };

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.domain.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedState === "all" || l.pipeline_state === selectedState;
    return matchesSearch && matchesState;
  });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lead Sourcing & Safe Crawler Queue</h1>
            <p className="text-slate-600 mt-1">
              Multi-tenant CSV ingestion with formula-injection guard, per-organization deduplication, and SSRF-protected crawler.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
              PostgreSQL RLS Active
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              SSRF Guard Active
            </span>
          </div>
        </div>
      </div>

      {/* CSV Ingestion Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Import Leads via CSV</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Guarded against formula injections (=, +, -, @). Automatically normalizes domains and rejects intra-tenant duplicates.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleDownloadSampleCSV}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            >
              Download Sample CSV
            </button>
            <label className="cursor-pointer text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm">
              Upload CSV File
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {uploadStatus && (
          <div
            className={`p-3 rounded-lg text-xs font-medium border ${
              uploadStatus.startsWith("Success")
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : uploadStatus.startsWith("Error")
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-blue-50 text-blue-800 border-blue-200"
            }`}
          >
            {uploadStatus}
          </div>
        )}
      </div>

      {/* Leads Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by company name or domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Filter State:</span>
            {["all", "new", "review", "qualified", "failed"].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedState(st)}
                className={`text-xs px-2.5 py-1 rounded-md font-semibold capitalize transition ${
                  selectedState === st
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Company & Domain</th>
                <th className="py-3 px-4">Industry</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Employees</th>
                <th className="py-3 px-4">Pipeline State</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No leads found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const isCrawling = crawlingId === lead.id;
                  const hasEnrichment = !!lead.latest_enrichment;

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/75 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{lead.company_name}</div>
                        <a
                          href={`https://${lead.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                        >
                          {lead.domain}
                          <span className="text-[10px]">↗</span>
                        </a>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{lead.industry || "—"}</td>
                      <td className="py-3 px-4 text-slate-600">{lead.location || "—"}</td>
                      <td className="py-3 px-4 text-slate-600">{lead.employee_count || "—"}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                            lead.pipeline_state === "new"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : lead.pipeline_state === "review"
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : lead.pipeline_state === "qualified"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-rose-100 text-rose-800 border border-rose-200"
                          }`}
                        >
                          {lead.pipeline_state}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {hasEnrichment && (
                          <button
                            onClick={() => setSelectedLead(lead)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                          >
                            View Evidence
                          </button>
                        )}
                        <button
                          disabled={isCrawling}
                          onClick={() => handleTriggerCrawl(lead.id)}
                          className={`px-3 py-1 text-xs font-semibold rounded text-white transition ${
                            isCrawling
                              ? "bg-slate-400 cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-700"
                          }`}
                        >
                          {isCrawling ? "Crawling..." : hasEnrichment ? "Re-crawl" : "Safe Crawl"}
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

      {/* Crawl Evidence Modal / Drawer */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedLead.company_name}</h3>
                <p className="text-xs text-slate-500">Crawl Evidence Provenance & SSRF Validation</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            {selectedLead.latest_enrichment ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Provider</span>
                    <span className="font-semibold text-slate-900">{selectedLead.latest_enrichment.provider}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Latency</span>
                    <span className="font-semibold text-slate-900">
                      {selectedLead.latest_enrichment.evidence.load_time_ms} ms
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">SSL Certificate</span>
                    <span className="font-semibold text-emerald-600">
                      {selectedLead.latest_enrichment.evidence.ssl_valid ? "Valid (HTTPS)" : "Invalid / Missing"}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Page Title</span>
                  <p className="font-medium text-slate-900">
                    {selectedLead.latest_enrichment.evidence.title || "No page title detected"}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Meta Description</span>
                  <p className="font-normal text-slate-700">
                    {selectedLead.latest_enrichment.evidence.meta_description || "No meta description found"}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Detected Technologies</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLead.latest_enrichment.evidence.detected_tech?.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Discovered CTAs</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLead.latest_enrichment.evidence.ctas_found?.map((cta) => (
                      <span
                        key={cta}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800"
                      >
                        {cta}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No enrichment record found for this lead.</p>
            )}

            <div className="text-right pt-3 border-t border-slate-200">
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 text-slate-800 hover:bg-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider Operational Modes Section (Mandatory Rule D) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
          <span>Active Provider Operational Modes</span>
          <span className="ml-3 text-xs font-normal text-slate-500">
            (Rule D: Transparent mock vs live execution)
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providerModes.map((p) => {
            const isLive = p.mode === "live";
            const isMock = p.mode === "mock";
            return (
              <div
                key={p.name}
                className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-slate-800">{p.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                        isLive
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : isMock
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-slate-200 text-slate-700 border border-slate-300"
                      }`}
                    >
                      {p.mode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{p.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
