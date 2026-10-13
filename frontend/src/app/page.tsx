"use client";

import React, { useState } from "react";
import { IntegrationSettings } from "@/components/IntegrationSettings";

interface SignalExplanation {
  signal_key: string;
  name: string;
  category: string;
  available: boolean;
  normalized_score: number;
  weight: number;
  weighted_contribution: number;
  summary: string;
}

interface ScoreRecord {
  id: string;
  final_score: number;
  qualification_band: "qualified" | "review" | "disqualified";
  website_group_score: number;
  marketing_group_score: number;
  ideal_client_bonus_applied: boolean;
  signal_breakdown: {
    explanations: SignalExplanation[];
    website_group?: { score: number; coverage_pct: number };
    marketing_group?: { score: number; coverage_pct: number };
    ideal_client_bonus_points?: number;
  };
}

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
  latest_score_record?: ScoreRecord;
}

const DEMO_SIGNALS_EXPLANATION: SignalExplanation[] = [
  { signal_key: "legacy_platform", name: "Modern Website Platform", category: "website", available: true, normalized_score: 80.0, weight: 1.0, weighted_contribution: 80.0, summary: "Modern Jamstack architecture detected (Next.js/Vercel)." },
  { signal_key: "slow_site", name: "Page Load Speed", category: "website", available: true, normalized_score: 90.0, weight: 1.2, weighted_contribution: 108.0, summary: "Fast server response time: 820ms (well under the 2.5s threshold)." },
  { signal_key: "old_design", name: "Responsive Modern Layout", category: "website", available: true, normalized_score: 85.0, weight: 0.8, weighted_contribution: 68.0, summary: "Modern semantic HTML5 layout with mobile viewport configured." },
  { signal_key: "weak_ctas", name: "Call-to-Action (CTA) Buttons", category: "website", available: true, normalized_score: 95.0, weight: 1.2, weighted_contribution: 114.0, summary: "3 prominent conversion buttons detected above the fold." },
  { signal_key: "not_mobile_friendly", name: "Mobile Responsiveness", category: "website", available: true, normalized_score: 100.0, weight: 1.5, weighted_contribution: 150.0, summary: "Mobile viewport meta tags properly configured for all screens." },
  { signal_key: "no_ssl", name: "Website Security (SSL / HTTPS)", category: "website", available: true, normalized_score: 100.0, weight: 1.5, weighted_contribution: 150.0, summary: "Valid TLS security certificate active with automatic HTTPS redirect." },
  { signal_key: "thin_content", name: "Website Content Depth", category: "website", available: true, normalized_score: 80.0, weight: 1.0, weighted_contribution: 80.0, summary: "Substantial informational content: 1,420 words on homepage." },
  { signal_key: "no_analytics", name: "Analytics & Tracking", category: "website", available: true, normalized_score: 90.0, weight: 0.8, weighted_contribution: 72.0, summary: "Google Analytics 4 and Tag Manager detected." },
  { signal_key: "accessibility", name: "Accessibility & Usability", category: "website", available: true, normalized_score: 75.0, weight: 0.8, weighted_contribution: 60.0, summary: "High usability: 92% of images include descriptive alt tags." },
  { signal_key: "no_live_chat", name: "Customer Chat & Messaging", category: "website", available: true, normalized_score: 85.0, weight: 0.7, weighted_contribution: 59.5, summary: "Live customer chat widget detected." },
  { signal_key: "poor_seo", name: "Search Engine (SEO) Basics", category: "marketing", available: true, normalized_score: 85.0, weight: 1.2, weighted_contribution: 102.0, summary: "Optimized search title and meta description present." },
  { signal_key: "poor_aeo_geo", name: "Structured Business Data", category: "marketing", available: true, normalized_score: 70.0, weight: 1.0, weighted_contribution: 70.0, summary: "Organization schema data detected for search engines." },
  { signal_key: "low_domain_trust", name: "Domain Trust & History", category: "marketing", available: true, normalized_score: 80.0, weight: 0.8, weighted_contribution: 64.0, summary: "Established top-level web address without spam flags." },
  { signal_key: "stale_blog", name: "Recent Blog & Resources", category: "marketing", available: true, normalized_score: 80.0, weight: 0.9, weighted_contribution: 72.0, summary: "Active publication schedule: 4 articles published in last 30 days." },
  { signal_key: "no_press", name: "Press & News Room", category: "marketing", available: true, normalized_score: 65.0, weight: 0.6, weighted_contribution: 39.0, summary: "Dedicated media and company news section found." },
  { signal_key: "no_case_studies", name: "Customer Proof & Case Studies", category: "marketing", available: true, normalized_score: 90.0, weight: 1.2, weighted_contribution: 108.0, summary: "Customer success stories and client logos displayed." },
  { signal_key: "no_video", name: "Product Video / Demos", category: "marketing", available: true, normalized_score: 70.0, weight: 0.6, weighted_contribution: 42.0, summary: "Product overview video embedded on landing page." },
  { signal_key: "weak_social", name: "Active Social Profiles", category: "marketing", available: true, normalized_score: 85.0, weight: 0.8, weighted_contribution: 68.0, summary: "Verified links to company LinkedIn and GitHub profiles." },
  { signal_key: "weak_email_capture", name: "Newsletter & Email Capture", category: "marketing", available: true, normalized_score: 80.0, weight: 1.0, weighted_contribution: 80.0, summary: "Newsletter lead capture form present in page footer." },
  { signal_key: "ppc_spend", name: "Digital Ad Retargeting", category: "marketing", available: true, normalized_score: 85.0, weight: 0.9, weighted_contribution: 76.5, summary: "Advertising remarketing tags detected." },
  { signal_key: "hiring", name: "Active Company Hiring", category: "marketing", available: true, normalized_score: 90.0, weight: 1.1, weighted_contribution: 99.0, summary: "Careers page links to multiple open roles." },
  { signal_key: "low_review_rating", name: "Third-Party Review Ratings", category: "marketing", available: true, normalized_score: 80.0, weight: 1.0, weighted_contribution: 80.0, summary: "Independent customer review ratings verified." },
];

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
    pipeline_state: "qualified",
    score_band: "qualified",
    latest_score: 88.5,
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
    latest_score_record: {
      id: "score-02",
      final_score: 88.5,
      qualification_band: "qualified",
      website_group_score: 87.2,
      marketing_group_score: 79.8,
      ideal_client_bonus_applied: true,
      signal_breakdown: {
        explanations: DEMO_SIGNALS_EXPLANATION,
        website_group: { score: 87.2, coverage_pct: 100.0 },
        marketing_group: { score: 79.8, coverage_pct: 100.0 },
        ideal_client_bonus_points: 10.0,
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

interface ActiveRunInfo {
  run_id: string;
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  current_company?: string;
}

export default function DashboardPage() {
  const [mainTab, setMainTab] = useState<"leads" | "integrations">("leads");
  const [leads, setLeads] = useState<LeadItem[]>(INITIAL_DEMO_LEADS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<"scoring" | "crawl">("scoring");
  const [crawlingId, setCrawlingId] = useState<string | null>(null);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [icpThreshold, setIcpThreshold] = useState<number>(65.0);
  const [activeRun, setActiveRun] = useState<ActiveRunInfo | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [usageLedger, setUsageLedger] = useState({
    pages_crawled: 14,
    leads_scored: 18,
    period: "2026-10",
  });

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("Uploading & safely checking CSV spreadsheet...");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setUploadStatus("Error: CSV must contain a header row and at least one lead.");
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
        setUploadStatus(`Success! Imported ${newLeads.length} leads safely. (${duplicateCount} duplicate websites skipped).`);
      } catch {
        setUploadStatus("Error reading CSV file. Please verify file format.");
      }
    };
    reader.readAsText(file);
  };

  const handleTriggerCrawl = (leadId: string) => {
    setCrawlingId(leadId);
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
                title: `${l.company_name} — Enterprise Solutions`,
                meta_description: `Official website of ${l.company_name}. Contact us for commercial inquiries.`,
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
    }, 1000);
  };

  const handleScoreLead = (leadId: string) => {
    setScoringId(leadId);
    setTimeout(() => {
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          const finalScore = 84.5;
          const band: "qualified" | "review" | "disqualified" = finalScore >= icpThreshold ? "qualified" : "review";

          const scoreRecord: ScoreRecord = {
            id: `score-${Date.now()}`,
            final_score: finalScore,
            qualification_band: band,
            website_group_score: 86.4,
            marketing_group_score: 72.6,
            ideal_client_bonus_applied: true,
            signal_breakdown: {
              explanations: DEMO_SIGNALS_EXPLANATION,
              website_group: { score: 86.4, coverage_pct: 100.0 },
              marketing_group: { score: 72.6, coverage_pct: 100.0 },
              ideal_client_bonus_points: 10.0,
            },
          };

          return {
            ...l,
            latest_score: finalScore,
            score_band: band,
            pipeline_state: band,
            latest_score_record: scoreRecord,
          };
        })
      );
      setScoringId(null);
    }, 1200);
  };

  const handleStartBatchRun = () => {
    const unscoredLeads = leads.filter((l) => l.latest_score === undefined);
    const leadsToProcess = unscoredLeads.length > 0 ? unscoredLeads : leads;
    if (leadsToProcess.length === 0) return;

    const runId = `run-${Date.now().toString(36)}`;
    setIsBatchRunning(true);
    setActiveRun({
      run_id: runId,
      status: "running",
      total_items: leadsToProcess.length,
      processed_items: 0,
      successful_items: 0,
      failed_items: 0,
      current_company: leadsToProcess[0]?.company_name,
    });

    let currentIdx = 0;
    const interval = setInterval(() => {
      if (currentIdx >= leadsToProcess.length) {
        clearInterval(interval);
        setIsBatchRunning(false);
        setActiveRun((prev) => (prev ? { ...prev, status: "completed", current_company: "Batch evaluation completed" } : null));
        setUsageLedger((prev) => ({
          ...prev,
          pages_crawled: prev.pages_crawled + leadsToProcess.length,
          leads_scored: prev.leads_scored + leadsToProcess.length,
        }));
        return;
      }

      const targetLead = leadsToProcess[currentIdx];
      const finalScore = 76.5 + ((currentIdx * 7) % 18);
      const band: "qualified" | "review" | "disqualified" = finalScore >= icpThreshold ? "qualified" : "review";

      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== targetLead.id) return l;
          return {
            ...l,
            pipeline_state: band,
            latest_score: finalScore,
            score_band: band,
            latest_enrichment: {
              status: "success",
              provider: "safe_crawler",
              evidence: {
                title: `${l.company_name} — Platform Overview`,
                meta_description: `Automated scan for ${l.company_name}.`,
                load_time_ms: 880 + (currentIdx * 80),
                ssl_valid: true,
                detected_tech: ["Next.js", "React", "Google Tag Manager"],
                ctas_found: ["Book Demo", "Start Trial"],
              },
            },
            latest_score_record: {
              id: `score-batch-${Date.now()}-${currentIdx}`,
              final_score: finalScore,
              qualification_band: band,
              website_group_score: 84.0,
              marketing_group_score: 75.0,
              ideal_client_bonus_applied: true,
              signal_breakdown: {
                explanations: DEMO_SIGNALS_EXPLANATION,
                website_group: { score: 84.0, coverage_pct: 100.0 },
                marketing_group: { score: 75.0, coverage_pct: 100.0 },
                ideal_client_bonus_points: 10.0,
              },
            },
          };
        })
      );

      currentIdx++;
      setActiveRun((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          processed_items: currentIdx,
          successful_items: currentIdx,
          current_company: currentIdx < leadsToProcess.length ? leadsToProcess[currentIdx]?.company_name : "Finalizing results...",
        };
      });
    }, 1000);
  };

  const handleCancelBatchRun = () => {
    setIsBatchRunning(false);
    setActiveRun((prev) => (prev ? { ...prev, status: "cancelled", current_company: "Cancelled by user" } : null));
  };

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.domain.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedState === "all" || l.pipeline_state === selectedState;
    return matchesSearch && matchesState;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Prospect Qualification & Review Center</h1>
            <p className="text-slate-600 text-sm mt-1">
              Automated 22-point website and marketing audit, transparent lead scoring, and team review workflow.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
              22 Evaluation Checks Active
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Target Profile Engine
            </span>
          </div>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex border-b border-slate-200 space-x-8 text-sm font-bold">
        <button
          onClick={() => setMainTab("leads")}
          className={`pb-3 border-b-2 transition flex items-center gap-2 ${
            mainTab === "leads"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Prospects & Lead Qualification</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
            {leads.length}
          </span>
        </button>
        <button
          onClick={() => setMainTab("integrations")}
          className={`pb-3 border-b-2 transition flex items-center gap-2 ${
            mainTab === "integrations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Data Providers & Free Quotas</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
            100% Free Tier
          </span>
        </button>
      </div>

      {/* View 1: Leads & Qualification */}
      {mainTab === "leads" && (
        <div className="space-y-6">
          {/* Configuration & Usage Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Qualification Threshold Slider */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                    Target Customer Qualification Standard
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5 block">
                    Minimum score required to qualify leads (checks 10 website performance factors and 12 marketing signals).
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <label htmlFor="threshold-range" className="text-xs text-slate-600 font-medium">
                      Minimum Score:
                    </label>
                    <input
                      id="threshold-range"
                      type="range"
                      min="50"
                      max="90"
                      value={icpThreshold}
                      onChange={(e) => setIcpThreshold(Number(e.target.value))}
                      className="w-24 accent-blue-600"
                    />
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {icpThreshold}/100
                    </span>
                  </div>
                  <span className="text-xs text-emerald-700 font-semibold flex items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1"></span>
                    +10 Best-Fit Bonus
                  </span>
                </div>
              </div>
            </div>

            {/* Monthly Plan Usage Strip */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Monthly Plan Usage & Queue
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5 block">
                    Billing Cycle: {usageLedger.period} | Guaranteed $0.00 Cost
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-xs">
                  <div className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Websites Scanned</span>
                    <span className="font-bold text-slate-900">{usageLedger.pages_crawled} <span className="text-slate-400 font-normal">/ 10,000</span></span>
                  </div>
                  <div className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Prospects Evaluated</span>
                    <span className="font-bold text-slate-900">{usageLedger.leads_scored} <span className="text-slate-400 font-normal">/ 5,000</span></span>
                  </div>
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                    Processing Engine Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CSV Import & Batch Trigger */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Import Prospects & Batch Scoring</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload clean spreadsheets safely. Automatically normalizes website links and prevents duplicates.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
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
                <button
                  disabled={isBatchRunning}
                  onClick={handleStartBatchRun}
                  className={`text-xs font-semibold px-4 py-2 rounded-lg text-white transition flex items-center gap-1.5 shadow-sm ${
                    isBatchRunning
                      ? "bg-slate-400 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {isBatchRunning ? (
                    <>
                      <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                      Evaluating Prospects...
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      Score All Unscored Prospects
                    </>
                  )}
                </button>
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

          {/* Active Batch Run Monitor Card */}
          {activeRun && (
            <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-5 bg-gradient-to-r from-indigo-50/40 via-white to-blue-50/30">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <div className="flex items-center space-x-3">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      activeRun.status === "running"
                        ? "bg-indigo-600 animate-pulse"
                        : activeRun.status === "completed"
                        ? "bg-emerald-500"
                        : activeRun.status === "cancelled"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                  ></span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        Batch Processing Job: <code className="text-xs font-mono text-indigo-700">{activeRun.run_id}</code>
                      </h3>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          activeRun.status === "running"
                            ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            : activeRun.status === "completed"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {activeRun.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Current Prospect: <span className="font-semibold text-slate-800">{activeRun.current_company || "Starting batch..."}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold text-slate-700">
                    {activeRun.processed_items} / {activeRun.total_items} prospects evaluated
                  </span>
                  {activeRun.status === "running" && (
                    <button
                      onClick={handleCancelBatchRun}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 transition"
                    >
                      Cancel Job
                    </button>
                  )}
                  {activeRun.status !== "running" && (
                    <button
                      onClick={() => setActiveRun(null)}
                      className="text-xs font-medium px-2.5 py-1 rounded text-slate-500 hover:text-slate-700"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 transition-all duration-500 rounded-full ${
                    activeRun.status === "completed"
                      ? "bg-emerald-500"
                      : activeRun.status === "cancelled"
                      ? "bg-amber-500"
                      : "bg-indigo-600"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((activeRun.processed_items / Math.max(activeRun.total_items, 1)) * 100)
                    )}%`,
                  }}
                ></div>
              </div>
            </div>
          )}

          {/* Prospects Queue & Scoring Table */}
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
                <span className="text-xs text-slate-500 font-medium">Filter Status:</span>
                {["all", "new", "review", "qualified", "rejected"].map((st) => (
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
                    <th className="py-3 px-4">Company & Website</th>
                    <th className="py-3 px-4">Industry / Location</th>
                    <th className="py-3 px-4">Quality Score</th>
                    <th className="py-3 px-4">Review Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No prospects found matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const isCrawling = crawlingId === lead.id;
                      const isScoring = scoringId === lead.id;
                      const hasEnrichment = !!lead.latest_enrichment;
                      const hasScore = lead.latest_score !== undefined;

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
                          <td className="py-3 px-4">
                            <div className="text-slate-800 font-medium">{lead.industry || "—"}</div>
                            <div className="text-slate-500 text-[11px]">{lead.location || "—"}</div>
                          </td>
                          <td className="py-3 px-4">
                            {hasScore ? (
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`text-sm font-extrabold ${
                                    lead.latest_score! >= icpThreshold
                                      ? "text-emerald-700"
                                      : lead.latest_score! >= 40
                                      ? "text-amber-700"
                                      : "text-rose-700"
                                  }`}
                                >
                                  {lead.latest_score}/100
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    lead.score_band === "qualified"
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                      : lead.score_band === "review"
                                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                                      : "bg-rose-100 text-rose-800 border border-rose-200"
                                  }`}
                                >
                                  {lead.score_band}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Not evaluated</span>
                            )}
                          </td>
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
                            {(hasEnrichment || hasScore) && (
                              <button
                                onClick={() => {
                                  setSelectedLead(lead);
                                  setActiveModalTab(hasScore ? "scoring" : "crawl");
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                              >
                                View Audit
                              </button>
                            )}
                            <button
                              disabled={isCrawling}
                              onClick={() => handleTriggerCrawl(lead.id)}
                              className={`px-3 py-1 text-xs font-semibold rounded text-white transition ${
                                isCrawling ? "bg-slate-400 cursor-not-allowed" : "bg-slate-700 hover:bg-slate-800"
                              }`}
                            >
                              {isCrawling ? "Scanning..." : "Scan Site"}
                            </button>
                            <button
                              disabled={isScoring}
                              onClick={() => handleScoreLead(lead.id)}
                              className={`px-3 py-1 text-xs font-semibold rounded text-white transition ${
                                isScoring ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                              }`}
                            >
                              {isScoring ? "Evaluating..." : hasScore ? "Re-evaluate" : "Evaluate Lead"}
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

          {/* Quick link to Provider Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">External Integrations & Safety Policies</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Local safe scanner is active. High-cost external services are blocked to protect your budget.
              </p>
            </div>
            <button
              onClick={() => setMainTab("integrations")}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 transition"
            >
              Configure Data Providers & Limits →
            </button>
          </div>
        </div>
      )}

      {/* View 2: Data Providers & Quotas */}
      {mainTab === "integrations" && <IntegrationSettings />}

      {/* Score & Crawl Evidence Drawer / Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedLead.company_name}</h3>
                <p className="text-xs text-slate-500">Website: {selectedLead.domain} | 22-Point Comprehensive Quality Audit</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 space-x-6 text-xs font-semibold">
              <button
                onClick={() => setActiveModalTab("scoring")}
                className={`pb-2 border-b-2 transition ${
                  activeModalTab === "scoring"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Quality Score Breakdown (22 Factors)
              </button>
              <button
                onClick={() => setActiveModalTab("crawl")}
                className={`pb-2 border-b-2 transition ${
                  activeModalTab === "crawl"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Website Verification & Scan Evidence
              </button>
            </div>

            {activeModalTab === "scoring" ? (
              selectedLead.latest_score_record ? (
                <div className="space-y-4 text-xs">
                  {/* Score KPI Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Overall Score</span>
                      <span className="text-xl font-black text-blue-700">
                        {selectedLead.latest_score_record.final_score}/100
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Qualification Band</span>
                      <span className="font-bold text-emerald-700 uppercase">
                        {selectedLead.latest_score_record.qualification_band}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Website Factors (1-10)</span>
                      <span className="font-bold text-slate-800">
                        {selectedLead.latest_score_record.website_group_score}/100
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Marketing Factors (11-22)</span>
                      <span className="font-bold text-slate-800">
                        {selectedLead.latest_score_record.marketing_group_score}/100
                      </span>
                    </div>
                  </div>

                  {/* Explainable Signals Table */}
                  <div>
                    <h4 className="font-bold text-slate-800 mb-2">Detailed 22-Point Quality Factors</h4>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Quality Factor</th>
                            <th className="py-2 px-3">Category</th>
                            <th className="py-2 px-3 text-center">Score</th>
                            <th className="py-2 px-3 text-center">Weight</th>
                            <th className="py-2 px-3">Audit Finding & Explanation</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedLead.latest_score_record.signal_breakdown.explanations.map((sig) => (
                            <tr key={sig.signal_key} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-semibold text-slate-900">{sig.name}</td>
                              <td className="py-2 px-3 uppercase text-[9px] font-bold text-slate-500">
                                {sig.category}
                              </td>
                              <td className="py-2 px-3 text-center font-bold text-slate-800">
                                {sig.normalized_score}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-500">{sig.weight}</td>
                              <td className="py-2 px-3 text-slate-600">{sig.summary}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">
                  This lead has not been evaluated yet. Click &quot;Evaluate Lead&quot; to review.
                </div>
              )
            ) : selectedLead.latest_enrichment ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Scanning Engine</span>
                    <span className="font-semibold text-slate-900">Local Native Scanner</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Page Load Time</span>
                    <span className="font-semibold text-slate-900">
                      {selectedLead.latest_enrichment.evidence.load_time_ms} ms
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Security (SSL)</span>
                    <span className="font-semibold text-emerald-600">
                      {selectedLead.latest_enrichment.evidence.ssl_valid ? "Valid (HTTPS)" : "Invalid"}
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
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Description</span>
                  <p className="font-normal text-slate-700">
                    {selectedLead.latest_enrichment.evidence.meta_description || "No meta description found"}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Detected Technologies</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLead.latest_enrichment.evidence.detected_tech?.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">No website scan record found for this prospect.</p>
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
    </div>
  );
}
