"use client";

import React, { useState, useEffect } from "react";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { useNav } from "@/lib/nav-context";

interface SignalExplanation {
  signal_key: string;
  name: string;
  category: "website" | "marketing";
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

interface ContactInfo {
  name: string;
  title: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  revealed: boolean;
}

interface LeadDraft {
  subject: string;
  body: string;
  tone: "consultative" | "direct" | "short";
  model: string;
  cost_usd: number;
  approved: boolean;
}

interface LeadItem {
  id: string;
  company_name: string;
  domain: string;
  industry?: string;
  location?: string;
  employee_count?: string;
  pipeline_state: "sourced" | "review" | "qualified" | "approved" | "drafted" | "synced" | "rejected";
  score_band?: "qualified" | "review" | "disqualified";
  latest_score?: number;
  contact?: ContactInfo;
  draft?: LeadDraft;
  hubspot_synced?: boolean;
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
      pagespeed_score?: number;
    };
  };
  latest_score_record?: ScoreRecord;
}

const DEMO_SIGNALS_EXPLANATION: SignalExplanation[] = [
  { signal_key: "legacy_platform", name: "Modern Website Platform", category: "website", available: true, normalized_score: 80.0, weight: 1.5, weighted_contribution: 120.0, summary: "Modern Jamstack architecture detected (Next.js/Vercel)." },
  { signal_key: "slow_site", name: "Fast Page Load Speed", category: "website", available: true, normalized_score: 90.0, weight: 1.3, weighted_contribution: 117.0, summary: "Mobile speed audit: 820ms response time, 92/100 Core Web Vitals." },
  { signal_key: "old_design", name: "Responsive Modern Layout", category: "website", available: true, normalized_score: 85.0, weight: 1.0, weighted_contribution: 85.0, summary: "Modern HTML5 semantic layout with responsive viewport tag." },
  { signal_key: "weak_ctas", name: "Call-to-Action (CTA) Prominence", category: "website", available: true, normalized_score: 95.0, weight: 1.0, weighted_contribution: 95.0, summary: "3 prominent conversion CTAs discovered above the fold." },
  { signal_key: "not_mobile_friendly", name: "Mobile Responsiveness", category: "website", available: true, normalized_score: 100.0, weight: 0.8, weighted_contribution: 80.0, summary: "Mobile viewport meta tags verified across multiple screen breakpoints." },
  { signal_key: "no_ssl", name: "Website Security (SSL / HTTPS)", category: "website", available: true, normalized_score: 100.0, weight: 1.2, weighted_contribution: 120.0, summary: "Valid TLS security certificate active with automatic HTTPS redirect." },
  { signal_key: "thin_content", name: "Homepage Content Depth", category: "website", available: true, normalized_score: 80.0, weight: 0.7, weighted_contribution: 56.0, summary: "Substantial informational content: 1,420 words on homepage." },
  { signal_key: "no_analytics", name: "Analytics & Tracking Setup", category: "website", available: true, normalized_score: 90.0, weight: 0.6, weighted_contribution: 54.0, summary: "Google Analytics 4 and Tag Manager active." },
  { signal_key: "accessibility", name: "Accessibility & Usability", category: "website", available: true, normalized_score: 75.0, weight: 0.6, weighted_contribution: 45.0, summary: "92% of images contain descriptive alt attributes; WCAG standard." },
  { signal_key: "no_live_chat", name: "Customer Chat & Conversion Widget", category: "website", available: true, normalized_score: 85.0, weight: 0.5, weighted_contribution: 42.5, summary: "Live chat widget detected." },
  { signal_key: "poor_seo", name: "Search Engine (SEO) Fundamentals", category: "marketing", available: true, normalized_score: 85.0, weight: 1.4, weighted_contribution: 119.0, summary: "Optimized title and meta description present." },
  { signal_key: "poor_aeo_geo", name: "Structured Data (Schema / JSON-LD)", category: "marketing", available: true, normalized_score: 70.0, weight: 1.0, weighted_contribution: 70.0, summary: "Organization schema data detected for search engines." },
  { signal_key: "low_domain_trust", name: "Domain Trust & History", category: "marketing", available: true, normalized_score: 80.0, weight: 0.6, weighted_contribution: 48.0, summary: "Established top-level web address without spam flags." },
  { signal_key: "stale_blog", name: "Recent Blog & Resources", category: "marketing", available: true, normalized_score: 80.0, weight: 1.1, weighted_contribution: 88.0, summary: "Active publication schedule: 4 articles published in last 30 days." },
  { signal_key: "no_press", name: "Press & News Room", category: "marketing", available: true, normalized_score: 65.0, weight: 0.7, weighted_contribution: 45.5, summary: "Dedicated media and company news section found." },
  { signal_key: "no_case_studies", name: "Customer Proof & Case Studies", category: "marketing", available: true, normalized_score: 90.0, weight: 0.8, weighted_contribution: 72.0, summary: "Customer success stories and client logos displayed." },
  { signal_key: "no_video", name: "Product Video / Demos", category: "marketing", available: true, normalized_score: 70.0, weight: 0.5, weighted_contribution: 35.0, summary: "Product overview video embedded on landing page." },
  { signal_key: "weak_social", name: "Active Social Profiles", category: "marketing", available: true, normalized_score: 85.0, weight: 0.9, weighted_contribution: 76.5, summary: "Verified links to company LinkedIn and GitHub profiles." },
  { signal_key: "weak_email_capture", name: "Newsletter & Email Capture", category: "marketing", available: true, normalized_score: 80.0, weight: 0.6, weighted_contribution: 48.0, summary: "Newsletter lead capture form present in page footer." },
  { signal_key: "ppc_spend", name: "Digital Ad Retargeting", category: "marketing", available: true, normalized_score: 85.0, weight: 1.2, weighted_contribution: 102.0, summary: "Advertising remarketing tags detected." },
  { signal_key: "hiring", name: "Active Company Hiring", category: "marketing", available: true, normalized_score: 90.0, weight: 1.1, weighted_contribution: 99.0, summary: "Careers page links to multiple open roles." },
  { signal_key: "low_review_rating", name: "Third-Party Review Ratings", category: "marketing", available: true, normalized_score: 80.0, weight: 0.8, weighted_contribution: 64.0, summary: "Independent customer review ratings verified." },
];

const INITIAL_DEMO_LEADS: LeadItem[] = [
  {
    id: "lead-01",
    company_name: "Apex Global Logistics",
    domain: "apexlogisticstech.com",
    industry: "Logistics & Supply Chain",
    location: "Chicago, IL",
    employee_count: "100-250",
    pipeline_state: "review",
    score_band: "review",
    latest_score: 68.0,
    contact: {
      name: "Marcus Vance",
      title: "VP of Digital Operations",
      email: "m.vance@apexlogisticstech.com",
      phone: "+1 (312) 555-0198",
      linkedin_url: "https://linkedin.com/in/marcus-vance-logistics",
      revealed: false,
    },
    latest_enrichment: {
      status: "success",
      provider: "safe_crawler",
      evidence: {
        title: "Apex Global Logistics — Global Freight & Fleet",
        meta_description: "End-to-end multi-modal transportation logistics.",
        load_time_ms: 1820.0,
        ssl_valid: true,
        detected_tech: ["WordPress 6.2", "jQuery 3.6"],
        ctas_found: ["Request Quote", "Contact Team"],
        pagespeed_score: 62,
      },
    },
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
    contact: {
      name: "Sarah Jenkins",
      title: "Chief Technology Officer",
      email: "sarah.jenkins@nexuracloud.io",
      phone: "+1 (512) 555-0144",
      linkedin_url: "https://linkedin.com/in/sarah-jenkins-cloud",
      revealed: true,
    },
    draft: {
      subject: "Quick thought on Nexura's multi-region failover & web performance",
      body: "Hi Sarah,\n\nNoticed Nexura's recent expansion into multi-region Kubernetes clusters—congrats on the growth.\n\nWhile auditing your tech stack, I saw you're running Next.js with strong Core Web Vitals (92/100), but your CTA conversion paths could capture significantly more enterprise demo volume. We recently helped a comparable cloud platform double their demo conversions.\n\nOpen to a brief 10-minute exchange this Thursday?\n\nBest,\nLeadFlow Strategy Team",
      tone: "consultative",
      model: "openrouter/anthropic/claude-3.5-sonnet",
      cost_usd: 0.018,
      approved: false,
    },
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
        pagespeed_score: 92,
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
    pipeline_state: "sourced",
    contact: {
      name: "Arthur Pendelton",
      title: "Managing Director",
      email: "arthur@legacywholesale1984.com",
      revealed: false,
    },
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
  const { activeTab, setLeadsCount } = useNav();
  const [leads, setLeads] = useState<LeadItem[]>(INITIAL_DEMO_LEADS);

  useEffect(() => {
    setLeadsCount(leads.length);
  }, [leads.length, setLeadsCount]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFunnelState, setSelectedFunnelState] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<"scoring" | "crawl">("scoring");
  const [activeDraftLead, setActiveDraftLead] = useState<LeadItem | null>(null);
  const [draftTone, setDraftTone] = useState<"consultative" | "direct" | "short">("consultative");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [revealModalLead, setRevealModalLead] = useState<LeadItem | null>(null);
  const [crawlingId, setCrawlingId] = useState<string | null>(null);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [icpThreshold, setIcpThreshold] = useState<number>(65.0);
  const [activeRun, setActiveRun] = useState<ActiveRunInfo | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Funnel Stage Counts (Handbook Section 5.3)
  const funnelCounts = {
    review: leads.filter((l) => l.pipeline_state === "review").length,
    qualified: leads.filter((l) => l.pipeline_state === "qualified").length,
    approved: leads.filter((l) => l.pipeline_state === "approved").length,
    drafted: leads.filter((l) => l.pipeline_state === "drafted").length,
    synced: leads.filter((l) => l.pipeline_state === "synced").length,
  };

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
    showToast("Sample CSV downloaded");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("Uploading & validating CSV spreadsheet...");

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
              pipeline_state: "sourced",
              contact: {
                name: "Primary Contact",
                title: "Business Leader",
                email: `contact@${domain}`,
                revealed: false,
              },
            });
          }
        }

        setLeads((prev) => [...newLeads, ...prev]);
        setUploadStatus(`Imported ${newLeads.length} leads safely. (${duplicateCount} duplicate websites skipped).`);
        showToast(`Imported ${newLeads.length} leads safely`);
      } catch {
        setUploadStatus("Error parsing uploaded CSV file.");
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
                pagespeed_score: 78,
              },
            },
          };
        })
      );
      setCrawlingId(null);
      showToast("Website audit completed");
    }, 900);
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
      showToast("Lead scored across 22 signals");
    }, 1000);
  };

  // Handbook 3.1 FDD Rule: Human Approve / Reject
  const handleApproveLead = (leadId: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, pipeline_state: "approved" } : l))
    );
    showToast("Lead approved for outreach drafting");
  };

  const handleRejectLead = (leadId: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, pipeline_state: "rejected" } : l))
    );
    showToast("Lead rejected from active pipeline");
  };

  // Handbook 5.4: Credit-gated Reveal
  const handleConfirmReveal = (leadId: string) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId || !l.contact) return l;
        return {
          ...l,
          contact: {
            ...l.contact,
            revealed: true,
          },
        };
      })
    );
    setRevealModalLead(null);
    showToast("Contact revealed (1 Apollo credit consumed)");
  };

  // Handbook 3.2: Open Draft Studio
  const handleOpenDraftStudio = (lead: LeadItem) => {
    setActiveDraftLead(lead);
    const company = lead.company_name;
    const name = lead.contact?.name.split(" ")[0] || "there";

    let subject = `Growth inquiry: ${company} digital infrastructure`;
    let body = `Hi ${name},\n\nI was reviewing ${company}'s digital presence and noted your strong platform fundamentals.\n\nHowever, our technical analysis spotted opportunities to accelerate page load times and improve conversion CTAs. We've helped similar teams unlock 25-40% more inbound pipeline.\n\nWould you be open to a 10-minute briefing next week?\n\nBest regards,\nLeadFlow Strategy Team`;

    if (draftTone === "direct") {
      subject = `Quick question regarding ${company}'s website performance`;
      body = `Hi ${name},\n\nWe analyzed ${company}'s web footprint and identified high-impact conversion gaps above the fold.\n\nAre you available for a brief 5-minute call this Thursday at 2pm?\n\nThanks,\nLeadFlow Strategy Team`;
    } else if (draftTone === "short") {
      subject = `Idea for ${company}`;
      body = `Hi ${name},\n\nNoticed ${company}'s recent growth. We found 3 quick technical optimizations on your homepage that could boost demo conversions.\n\nWorth a quick chat?\n\nBest,\nLeadFlow Strategy Team`;
    }

    setDraftSubject(lead.draft?.subject || subject);
    setDraftBody(lead.draft?.body || body);
  };

  const handleSaveAndApproveDraft = () => {
    if (!activeDraftLead) return;
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== activeDraftLead.id) return l;
        return {
          ...l,
          pipeline_state: "drafted",
          draft: {
            subject: draftSubject,
            body: draftBody,
            tone: draftTone,
            model: "openrouter/anthropic/claude-3.5-sonnet",
            cost_usd: 0.015,
            approved: true,
          },
        };
      })
    );
    setActiveDraftLead(null);
    showToast("Draft approved and ready for HubSpot CRM sync");
  };

  // Handbook 6.1: Sync to HubSpot CRM
  const handleSyncToHubSpot = (leadId: string) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          pipeline_state: "synced",
          hubspot_synced: true,
        };
      })
    );
    showToast("Contact and draft synced to HubSpot CRM");
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
        setActiveRun((prev) => (prev ? { ...prev, status: "completed", current_company: "Batch run finished" } : null));
        showToast("Batch evaluation completed");
        return;
      }

      const targetLead = leadsToProcess[currentIdx];
      const finalScore = 78.0 + ((currentIdx * 6) % 16);
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
                load_time_ms: 920 + (currentIdx * 50),
                ssl_valid: true,
                detected_tech: ["Next.js", "React", "Google Analytics 4"],
                ctas_found: ["Book Demo", "Start Trial"],
                pagespeed_score: 85,
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
          current_company: currentIdx < leadsToProcess.length ? leadsToProcess[currentIdx]?.company_name : "Finalizing batch...",
        };
      });
    }, 800);
  };

  const handleCancelBatchRun = () => {
    setIsBatchRunning(false);
    setActiveRun((prev) => (prev ? { ...prev, status: "cancelled", current_company: "Cancelled by user" } : null));
    showToast("Batch run stopped");
  };

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.domain.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedFunnelState === "all" || l.pipeline_state === selectedFunnelState;
    return matchesSearch && matchesState;
  });

  return (
    <div className="space-y-7">
      {/* Toast Notification (Item 5: light red shade for clear visibility) */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-rose-50/95 dark:bg-rose-950/90 border border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          {toastMessage}
        </div>
      )}

      {/* Futuristic Hero & Funnel Overview */}
      <div className="glass-panel rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-cosmic-200 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-300 dark:border-obsidian-700">
                Handbook 5.3 Funnel
              </span>
              <span className="text-xs text-obsidian/50 dark:text-cosmic-400 font-mono">Apollo → Enrich → 22 Signals → HubSpot</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-obsidian dark:text-cosmic-100 tracking-tight">
              Qualification & CRM Outreach Hub
            </h1>
            <p className="text-obsidian/70 dark:text-cosmic-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Autonomous multi-signal audit across 22 parameters, credit-safe contact reveals, and bespoke AI outreach generation before CRM sync.
            </p>
          </div>

          {/* Interactive Live Funnel Metrics Strip */}
          <div className="grid grid-cols-5 gap-2 bg-cosmic-100/90 dark:bg-obsidian-800 p-2 rounded-2xl border border-cosmic-300 dark:border-obsidian-700">
            <div className="px-3 py-2 text-center rounded-xl bg-cosmic-50/70 dark:bg-obsidian-900 border border-cosmic-200 dark:border-obsidian-700">
              <div className="text-[10px] uppercase font-mono tracking-wider text-obsidian/50 dark:text-cosmic-400">Review</div>
              <div className="text-sm sm:text-base font-extrabold text-obsidian dark:text-cosmic-100">{funnelCounts.review}</div>
            </div>
            <div className="px-3 py-2 text-center rounded-xl bg-cosmic-50/70 dark:bg-obsidian-900 border border-cosmic-200 dark:border-obsidian-700">
              <div className="text-[10px] uppercase font-mono tracking-wider text-obsidian/50 dark:text-cosmic-400">Qualified</div>
              <div className="text-sm sm:text-base font-extrabold text-obsidian dark:text-cosmic-100">{funnelCounts.qualified}</div>
            </div>
            <div className="px-3 py-2 text-center rounded-xl bg-cosmic-50/70 dark:bg-obsidian-900 border border-cosmic-200 dark:border-obsidian-700">
              <div className="text-[10px] uppercase font-mono tracking-wider text-obsidian/50 dark:text-cosmic-400">Approved</div>
              <div className="text-sm sm:text-base font-extrabold text-obsidian dark:text-cosmic-100">{funnelCounts.approved}</div>
            </div>
            <div className="px-3 py-2 text-center rounded-xl bg-cosmic-50/70 dark:bg-obsidian-900 border border-cosmic-200 dark:border-obsidian-700">
              <div className="text-[10px] uppercase font-mono tracking-wider text-obsidian/50 dark:text-cosmic-400">Drafted</div>
              <div className="text-sm sm:text-base font-extrabold text-obsidian dark:text-cosmic-100">{funnelCounts.drafted}</div>
            </div>
            <div className="px-3 py-2 text-center rounded-xl bg-lilac-100/80 dark:bg-lilac-950/40 border border-lilac-200 dark:border-lilac-800">
              <div className="text-[10px] uppercase font-mono tracking-wider text-lilac-700 dark:text-lilac-300 font-bold">In CRM</div>
              <div className="text-sm sm:text-base font-extrabold text-lilac-800 dark:text-lilac-200">{funnelCounts.synced}</div>
            </div>
          </div>
        </div>

        {/* Arrow Flow shifted to hero card (Item 7) */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-cosmic-200/80 dark:border-obsidian-700">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold">
              Funnel Flow:
            </span>
            <div className="flex items-center space-x-1.5 bg-cosmic-100/90 dark:bg-obsidian-800 border border-cosmic-300 dark:border-obsidian-700 rounded-full px-3.5 py-1 text-xs text-obsidian/80 dark:text-cosmic-200 font-medium">
              <span className="font-semibold text-obsidian dark:text-cosmic-100">Review</span>
              <span className="text-blush-400 font-mono text-xs">→</span>
              <span className="font-semibold text-obsidian dark:text-cosmic-100">Qualified</span>
              <span className="text-blush-400 font-mono text-xs">→</span>
              <span className="font-semibold text-obsidian dark:text-cosmic-100">Approved</span>
              <span className="text-blush-400 font-mono text-xs">→</span>
              <span className="font-semibold text-obsidian dark:text-cosmic-100">Drafted</span>
              <span className="text-blush-400 font-mono text-xs">→</span>
              <span className="text-lilac-700 dark:text-lilac-300 font-bold flex items-center gap-1.5">
                In HubSpot
                <span className="w-1.5 h-1.5 rounded-full bg-lilac-500 animate-pulse"></span>
              </span>
            </div>
          </div>

          <div className="text-[11px] font-mono text-obsidian/50 dark:text-cosmic-400">
            Pipeline Mode: <span className="text-obsidian dark:text-cosmic-200 font-semibold">{activeTab === "leads" ? "Lead Qualification" : "Provider Settings"}</span>
          </div>
        </div>
      </div>

      {/* Main Tab 1: Leads Pipeline & Funnel */}
      {activeTab === "leads" && (
        <div className="space-y-6">
          {/* Controls & Metrics Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Qualification Standard Slider */}
            <div className="glass-panel rounded-3xl p-5 border border-blush-200/80 dark:border-obsidian-700 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 block">
                    Target Lead Qualification Standard
                  </span>
                  <span className="text-xs text-obsidian/70 dark:text-cosmic-300 mt-0.5 block leading-relaxed">
                    Threshold separating Review from Qualified (10 Website + 12 Marketing checks).
                  </span>
                </div>
                <div className="flex items-center space-x-3 bg-cosmic-100/90 dark:bg-obsidian-800 px-3 py-2 rounded-2xl border border-cosmic-300 dark:border-obsidian-700">
                  <div className="flex items-center space-x-2">
                    <label htmlFor="threshold-slider" className="text-[11px] text-obsidian/70 dark:text-cosmic-300 font-medium">Cutoff:</label>
                    <input
                      id="threshold-slider"
                      type="range"
                      min="50"
                      max="90"
                      value={icpThreshold}
                      onChange={(e) => setIcpThreshold(Number(e.target.value))}
                      className="w-20 accent-obsidian dark:accent-lilac-400 cursor-pointer"
                    />
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-cosmic-50 dark:bg-obsidian-900 text-obsidian dark:text-cosmic-100 border border-cosmic-300 dark:border-obsidian-700">
                      {icpThreshold}/100
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-lilac-700 dark:text-lilac-300 font-bold px-2 py-0.5 rounded-lg bg-lilac-50 dark:bg-lilac-950/50 border border-lilac-200 dark:border-lilac-800">
                    +10 Bonus
                  </span>
                </div>
              </div>
            </div>

            {/* Monthly Budget & Usage Strip */}
            <div className="glass-panel rounded-3xl p-5 border border-blush-200/80 dark:border-obsidian-700 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-lilac-500"></span>
                    SaaS Allotment & Safety Ledger
                  </span>
                  <span className="text-xs text-obsidian/70 dark:text-cosmic-300 mt-0.5 block">
                    Zero-Cost Guarantee: Hard spend cap enforced ($0.00 billable)
                  </span>
                </div>
                <div className="flex items-center space-x-2.5 text-xs">
                  <div className="px-3 py-1.5 rounded-2xl bg-cosmic-100/90 dark:bg-obsidian-800 border border-cosmic-300 dark:border-obsidian-700">
                    <span className="text-obsidian/50 dark:text-cosmic-400 text-[9px] uppercase font-mono font-bold block">Scanned Sites</span>
                    <span className="font-bold text-obsidian dark:text-cosmic-100 font-mono">14 <span className="text-obsidian/40 dark:text-cosmic-400/60 font-normal">/ 10,000</span></span>
                  </div>
                  <div className="px-3 py-1.5 rounded-2xl bg-cosmic-100/90 dark:bg-obsidian-800 border border-cosmic-300 dark:border-obsidian-700">
                    <span className="text-obsidian/50 dark:text-cosmic-400 text-[9px] uppercase font-mono font-bold block">Evaluated</span>
                    <span className="font-bold text-obsidian dark:text-cosmic-100 font-mono">18 <span className="text-obsidian/40 dark:text-cosmic-400/60 font-normal">/ 5,000</span></span>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-lilac-100 dark:bg-lilac-950/50 text-lilac-700 dark:text-lilac-300 border border-lilac-200 dark:border-lilac-800 uppercase">
                    Worker Idle
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sourcing & Action Header */}
          <div className="glass-panel rounded-3xl p-6 border border-blush-200/80 dark:border-obsidian-700 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-obsidian dark:text-cosmic-100 tracking-tight">Sourcing & Batch Pipeline</h2>
                <p className="text-xs text-obsidian/70 dark:text-cosmic-300 mt-0.5">
                  Import Apollo contacts or spreadsheet leads safely. Automatic formula guard and deduplication.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleDownloadSampleCSV}
                  className="text-xs font-semibold px-3 py-2 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-cosmic-100/80 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 transition"
                >
                  Download Sample CSV
                </button>
                <label className="cursor-pointer text-xs font-semibold px-4 py-2 rounded-xl bg-cosmic-200 dark:bg-obsidian-700 hover:bg-cosmic-300 dark:hover:bg-obsidian-600 border border-cosmic-300 dark:border-obsidian-600 text-obsidian dark:text-cosmic-100 transition shadow-sm">
                  Upload CSV
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
                <button
                  disabled={isBatchRunning}
                  onClick={handleStartBatchRun}
                  className={`text-xs font-semibold px-4 py-2 rounded-xl text-cosmic-50 transition flex items-center gap-2 shadow-obsidian ${
                    isBatchRunning ? "bg-obsidian/60 cursor-not-allowed" : "btn-obsidian"
                  }`}
                >
                  {isBatchRunning ? (
                    <>
                      <span className="animate-spin h-3 w-3 border-2 border-cosmic-50 border-t-transparent rounded-full"></span>
                      Evaluating Batch...
                    </>
                  ) : (
                    <>
                      <span className="text-lilac-300">⚡</span>
                      Run 22-Signal Batch Evaluation
                    </>
                  )}
                </button>
              </div>
            </div>

            {uploadStatus && (
              <div className="mt-4 p-3 rounded-2xl text-xs font-medium bg-lilac-50 dark:bg-lilac-950/40 border border-lilac-200 dark:border-lilac-800 text-obsidian dark:text-cosmic-200">
                {uploadStatus}
              </div>
            )}
          </div>

          {/* Active Batch Run Monitor */}
          {activeRun && (
            <div className="glass-panel rounded-3xl p-5 border border-lilac-300/80 dark:border-lilac-800 shadow-futuristic bg-gradient-to-r from-lilac-50/50 via-cosmic-100/40 to-blush-50/50 dark:from-lilac-950/30 dark:via-obsidian-900/50 dark:to-blush-950/30">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <div className="flex items-center space-x-3">
                  <span className={`w-3 h-3 rounded-full ${activeRun.status === "running" ? "bg-lilac-500 animate-pulse" : "bg-obsidian dark:bg-cosmic-100"}`}></span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100">
                        Active Job: <code className="font-mono text-xs text-lilac-700 dark:text-lilac-300">{activeRun.run_id}</code>
                      </h3>
                      <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-cosmic-200 dark:bg-obsidian-800 border border-cosmic-300 dark:border-obsidian-700 font-bold text-obsidian/70 dark:text-cosmic-300">
                        {activeRun.status}
                      </span>
                    </div>
                    <p className="text-xs text-obsidian/70 dark:text-cosmic-400 mt-0.5">
                      Target: <span className="font-semibold text-obsidian dark:text-cosmic-100">{activeRun.current_company || "Processing..."}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs font-mono font-bold text-obsidian dark:text-cosmic-100">
                    {activeRun.processed_items} / {activeRun.total_items} evaluated
                  </span>
                  {activeRun.status === "running" ? (
                    <button
                      onClick={handleCancelBatchRun}
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    >
                      Halt Run
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveRun(null)}
                      className="text-xs font-medium px-2.5 py-1 rounded-xl text-obsidian/50 dark:text-cosmic-400 hover:text-obsidian dark:hover:text-cosmic-200"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-cosmic-200 dark:bg-obsidian-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 bg-obsidian dark:bg-lilac-500 transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((activeRun.processed_items / Math.max(activeRun.total_items, 1)) * 100))}%`,
                  }}
                ></div>
              </div>
            </div>
          )}

          {/* Prospects Pipeline Table */}
          <div className="glass-panel rounded-3xl overflow-hidden border border-blush-200/80 dark:border-obsidian-700 shadow-futuristic">
            {/* Filter Bar */}
            <div className="p-4 border-b border-cosmic-200/90 dark:border-obsidian-800 bg-cosmic-100/70 dark:bg-obsidian-900/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3 flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Filter company, domain, or industry..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 border border-cosmic-300 dark:border-obsidian-700 rounded-xl bg-cosmic-50 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 placeholder:text-obsidian/40 dark:placeholder:text-cosmic-400/50"
                />
              </div>

              {/* Funnel Stage Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-obsidian/50 dark:text-cosmic-400 font-mono uppercase mr-1">Stage:</span>
                {["all", "review", "qualified", "approved", "drafted", "synced", "rejected"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setSelectedFunnelState(st)}
                    className={`text-xs px-2.5 py-1 rounded-xl font-medium capitalize transition ${
                      selectedFunnelState === st
                        ? "btn-obsidian"
                        : "bg-cosmic-50 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-200 dark:border-obsidian-700 hover:bg-cosmic-100 dark:hover:bg-obsidian-700"
                    }`}
                  >
                    {st === "synced" ? "In HubSpot" : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-cosmic-200/50 dark:bg-obsidian-900 text-obsidian/60 dark:text-cosmic-400 font-mono text-[10px] uppercase tracking-wider border-b border-cosmic-200 dark:border-obsidian-800">
                  <tr>
                    <th className="py-3 px-5">Company & Contact</th>
                    <th className="py-3 px-4">Market & Location</th>
                    <th className="py-3 px-4">22-Signal Score</th>
                    <th className="py-3 px-4">Funnel State</th>
                    <th className="py-3 px-5 text-right">Pipeline Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cosmic-200/70 dark:divide-obsidian-800">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-obsidian/50 dark:text-cosmic-400">
                        No prospects found matching your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const isCrawling = crawlingId === lead.id;
                      const isScoring = scoringId === lead.id;
                      const hasScore = lead.latest_score !== undefined;
                      const isApproved = lead.pipeline_state === "approved";
                      const isDrafted = lead.pipeline_state === "drafted";
                      const isSynced = lead.pipeline_state === "synced";

                      return (
                        <tr key={lead.id} className="hover:bg-cosmic-100/50 dark:hover:bg-obsidian-800/40 transition">
                          {/* Company & Contact Column */}
                          <td className="py-3.5 px-5">
                            <div className="font-bold text-obsidian dark:text-cosmic-100 text-sm">{lead.company_name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <a
                                href={`https://${lead.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-obsidian/60 dark:text-cosmic-400 hover:text-obsidian dark:hover:text-cosmic-200 flex items-center gap-1 font-mono text-[11px]"
                              >
                                {lead.domain} <span className="text-[9px]">↗</span>
                              </a>
                            </div>

                            {/* Contact Badge */}
                            {lead.contact && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-[11px] font-medium text-obsidian/80 dark:text-cosmic-300">
                                  {lead.contact.name} ({lead.contact.title})
                                </span>
                                {lead.contact.revealed ? (
                                  <span className="text-[10px] font-mono text-lilac-700 dark:text-lilac-300 bg-lilac-100 dark:bg-lilac-950/60 px-2 py-0.5 rounded-full border border-lilac-200 dark:border-lilac-800">
                                    {lead.contact.email}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setRevealModalLead(lead)}
                                    className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-cosmic-300 dark:border-obsidian-700 bg-cosmic-100 dark:bg-obsidian-800 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 text-obsidian/70 dark:text-cosmic-300 transition"
                                    title="Human credit gate"
                                  >
                                    Reveal Contact (1 Cr)
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Industry & Location */}
                          <td className="py-3.5 px-4">
                            <div className="text-obsidian dark:text-cosmic-200 font-medium">{lead.industry || "—"}</div>
                            <div className="text-obsidian/50 dark:text-cosmic-400 text-[11px]">{lead.location || "—"}</div>
                          </td>

                          {/* 22-Signal Score */}
                          <td className="py-3.5 px-4">
                            {hasScore ? (
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`text-sm font-mono font-extrabold ${
                                    lead.latest_score! >= icpThreshold ? "text-obsidian dark:text-cosmic-100" : "text-obsidian/60 dark:text-cosmic-400"
                                  }`}
                                >
                                  {lead.latest_score}/100
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border ${
                                    lead.score_band === "qualified"
                                      ? "bg-lilac-100 dark:bg-lilac-950/50 text-lilac-700 dark:text-lilac-300 border-lilac-300 dark:border-lilac-800"
                                      : lead.score_band === "review"
                                      ? "bg-blush-100 dark:bg-blush-950/50 text-blush-600 dark:text-blush-300 border-blush-200 dark:border-blush-800"
                                      : "bg-cosmic-200 dark:bg-obsidian-800 text-obsidian/60 dark:text-cosmic-400 border-cosmic-300 dark:border-obsidian-700"
                                  }`}
                                >
                                  {lead.score_band}
                                </span>
                              </div>
                            ) : (
                              <span className="text-obsidian/40 dark:text-cosmic-400/60 italic font-mono text-[11px]">Pending audit</span>
                            )}
                          </td>

                          {/* Funnel State Pill */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-mono font-bold uppercase text-[9px] tracking-wider border ${
                                lead.pipeline_state === "synced"
                                  ? "bg-lilac-200 dark:bg-lilac-950/60 text-lilac-800 dark:text-lilac-200 border-lilac-400 dark:border-lilac-700"
                                  : lead.pipeline_state === "drafted"
                                  ? "bg-lilac-100 dark:bg-lilac-950/40 text-lilac-700 dark:text-lilac-300 border-lilac-300 dark:border-lilac-800"
                                  : lead.pipeline_state === "approved"
                                  ? "bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 border-cosmic-300 dark:border-obsidian-700"
                                  : lead.pipeline_state === "qualified"
                                  ? "bg-blush-100 dark:bg-blush-950/40 text-blush-600 dark:text-blush-300 border-blush-200 dark:border-blush-800"
                                  : lead.pipeline_state === "review"
                                  ? "bg-cosmic-200 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border-cosmic-300 dark:border-obsidian-700"
                                  : "bg-cosmic-100 dark:bg-obsidian-800 text-obsidian/50 dark:text-cosmic-400 border-cosmic-200 dark:border-obsidian-700"
                              }`}
                            >
                              {lead.pipeline_state === "synced" ? "In HubSpot" : lead.pipeline_state}
                            </span>
                          </td>

                          {/* Handbook 3.1 & 5.3 Actions */}
                          <td className="py-3.5 px-5 text-right space-x-1.5">
                            {/* Detailed Audit Breakdown */}
                            <button
                              onClick={() => {
                                setSelectedLead(lead);
                                setActiveModalTab(hasScore ? "scoring" : "crawl");
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-xl border border-cosmic-300 dark:border-obsidian-700 text-obsidian/80 dark:text-cosmic-300 hover:bg-cosmic-200 dark:hover:bg-obsidian-800 dark:hover:text-cosmic-100 transition"
                            >
                              Audit
                            </button>

                            {/* Scoring / Re-scoring */}
                            <button
                              disabled={isScoring}
                              onClick={() => handleScoreLead(lead.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-xl border border-cosmic-300 dark:border-obsidian-700 text-obsidian/80 dark:text-cosmic-300 hover:bg-cosmic-200 dark:hover:bg-obsidian-800 dark:hover:text-cosmic-100 transition"
                            >
                              {isScoring ? "Scoring..." : hasScore ? "Re-score" : "Score"}
                            </button>

                            {/* Human Approval Gate (Handbook FDD Rule 2) */}
                            {lead.pipeline_state === "qualified" && (
                              <>
                                <button
                                  onClick={() => handleApproveLead(lead.id)}
                                  className="btn-obsidian px-3 py-1 text-xs font-semibold rounded-xl"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectLead(lead.id)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-xl border border-cosmic-300 dark:border-obsidian-700 text-obsidian/50 dark:text-cosmic-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 transition"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {/* AI Outreach Draft Studio */}
                            {(isApproved || isDrafted) && (
                              <button
                                onClick={() => handleOpenDraftStudio(lead)}
                                className="btn-obsidian px-3 py-1 text-xs font-semibold rounded-xl flex-inline items-center gap-1 shadow-sm"
                              >
                                {isDrafted ? "Edit Draft" : "Generate Draft"}
                              </button>
                            )}

                            {/* HubSpot CRM Sync (Only after draft approved) */}
                            {isDrafted && !isSynced && (
                              <button
                                onClick={() => handleSyncToHubSpot(lead.id)}
                                className="px-3 py-1 text-xs font-bold rounded-xl bg-lilac-200 hover:bg-lilac-300 dark:bg-lilac-900/60 dark:hover:bg-lilac-800/80 text-lilac-800 dark:text-lilac-200 border border-lilac-300 dark:border-lilac-700 transition"
                              >
                                Sync CRM
                              </button>
                            )}

                            {isSynced && (
                              <span className="text-[11px] font-mono text-lilac-700 dark:text-lilac-300 font-bold px-2 py-0.5 rounded-lg bg-lilac-100 dark:bg-lilac-950/60 border border-lilac-200 dark:border-lilac-800">
                                Synced ✓
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab 2: Providers & Free Quotas */}
      {activeTab === "integrations" && <IntegrationSettings />}

      {/* Credit-Gated Contact Reveal Modal (Handbook 5.4) */}
      {revealModalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-obsidian-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Confirm Contact Reveal</h3>
              <button
                onClick={() => setRevealModalLead(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-lg"
              >
                &times;
              </button>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                Revealing verified contact information for <span className="font-bold text-slate-900 dark:text-white">{revealModalLead.contact?.name}</span> ({revealModalLead.contact?.title}) at <span className="font-bold text-slate-900 dark:text-white">{revealModalLead.company_name}</span>.
              </p>
              <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200 dark:border-obsidian-700 space-y-1">
                <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold">Credit Gate Policy:</div>
                <div className="text-slate-900 dark:text-white font-semibold">Consumes 1 Apollo Reveal Credit</div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px]">Human authorization required. No silent credit deduction.</div>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-obsidian-700">
              <button
                onClick={() => setRevealModalLead(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-obsidian-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmReveal(revealModalLead.id)}
                className="btn-obsidian px-4 py-2 text-xs font-semibold rounded-xl"
              >
                Confirm Reveal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Outreach Draft Studio Modal (Handbook 3.2) */}
      {activeDraftLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-obsidian-700 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Draft Studio: {activeDraftLead.company_name}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Recipient: {activeDraftLead.contact?.name} ({activeDraftLead.contact?.title}) | OpenRouter AI
                </p>
              </div>
              <button
                onClick={() => setActiveDraftLead(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {/* Tone Selector & Model Indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-obsidian-800 p-3 rounded-2xl border border-slate-200 dark:border-obsidian-700 text-xs">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold mr-1">Angle / Tone:</span>
                {(["consultative", "direct", "short"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setDraftTone(t);
                      handleOpenDraftStudio(activeDraftLead);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold capitalize transition ${
                      draftTone === t ? "btn-obsidian" : "bg-white dark:bg-obsidian-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-obsidian-600 hover:bg-slate-100"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <span>Model: claude-3.5-sonnet</span>
                <span className="text-lilac-700 dark:text-lilac-300 font-bold">~$0.02 / draft</span>
              </div>
            </div>

            {/* Subject Input */}
            <div className="space-y-1 text-xs">
              <label htmlFor="draft-subject" className="font-mono uppercase text-[10px] font-bold text-slate-500 dark:text-slate-400">Subject Line</label>
              <input
                id="draft-subject"
                type="text"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-obsidian-700 bg-slate-50 dark:bg-obsidian-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lilac-400 font-medium"
              />
            </div>

            {/* Body Input */}
            <div className="space-y-1 text-xs">
              <label htmlFor="draft-body" className="font-mono uppercase text-[10px] font-bold text-slate-500 dark:text-slate-400">Email Copy (Editable)</label>
              <textarea
                id="draft-body"
                rows={7}
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-obsidian-700 bg-slate-50 dark:bg-obsidian-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lilac-400 font-sans text-xs leading-relaxed"
              ></textarea>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-obsidian-700">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                FDD Rule: Lead cannot sync to CRM until draft is approved.
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveDraftLead(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-obsidian-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAndApproveDraft}
                  className="btn-obsidian px-4 py-2 text-xs font-semibold rounded-xl"
                >
                  Approve Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 22-Signal Score & Evidence Modal (Item 3: Clean, crisp white background) */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 rounded-3xl max-w-3xl w-full p-6 sm:p-7 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-obsidian-700 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{selectedLead.company_name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {selectedLead.domain} | 22-Signal Qualification Audit
                </p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 dark:border-obsidian-700 space-x-6 text-xs font-semibold">
              <button
                onClick={() => setActiveModalTab("scoring")}
                className={`pb-2 border-b-2 transition ${
                  activeModalTab === "scoring"
                    ? "border-slate-900 dark:border-white text-slate-900 dark:text-white font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                22-Signal Audit Breakdown
              </button>
              <button
                onClick={() => setActiveModalTab("crawl")}
                className={`pb-2 border-b-2 transition ${
                  activeModalTab === "crawl"
                    ? "border-slate-900 dark:border-white text-slate-900 dark:text-white font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Website Verification & Tech Stack
              </button>
            </div>

            {activeModalTab === "scoring" ? (
              selectedLead.latest_score_record ? (
                <div className="space-y-4 text-xs">
                  {/* Metric Gauges with clean light background */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200/90 dark:border-obsidian-700">
                      <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Overall Score</span>
                      <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
                        {selectedLead.latest_score_record.final_score}/100
                      </span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200/90 dark:border-obsidian-700">
                      <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Funnel Band</span>
                      <span className="font-bold text-lilac-700 dark:text-lilac-300 uppercase font-mono">
                        {selectedLead.latest_score_record.qualification_band}
                      </span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200/90 dark:border-obsidian-700">
                      <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Website Group (1-10)</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {selectedLead.latest_score_record.website_group_score}/100
                      </span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200/90 dark:border-obsidian-700">
                      <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Marketing Group (11-22)</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {selectedLead.latest_score_record.marketing_group_score}/100
                      </span>
                    </div>
                  </div>

                  {/* 22 Signals Table on clean white background */}
                  <div className="border border-slate-200 dark:border-obsidian-700 rounded-2xl overflow-hidden bg-white dark:bg-obsidian-900">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100/90 dark:bg-obsidian-800 text-slate-700 dark:text-slate-300 font-mono uppercase text-[9px]">
                        <tr>
                          <th className="py-2.5 px-3">Signal Name</th>
                          <th className="py-2.5 px-3">Group</th>
                          <th className="py-2.5 px-3 text-center">Score</th>
                          <th className="py-2.5 px-3 text-center">Weight</th>
                          <th className="py-2.5 px-3">Audit Evidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-obsidian-800">
                        {selectedLead.latest_score_record.signal_breakdown.explanations.map((sig) => (
                          <tr key={sig.signal_key} className="hover:bg-slate-50 dark:hover:bg-obsidian-800/60">
                            <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">{sig.name}</td>
                            <td className="py-2 px-3 uppercase text-[9px] font-mono text-slate-500 dark:text-slate-400">
                              {sig.category}
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-900 dark:text-white">
                              {sig.normalized_score}
                            </td>
                            <td className="py-2 px-3 text-center font-mono text-slate-500 dark:text-slate-400">{sig.weight}</td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{sig.summary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">
                  This lead has not been evaluated yet. Click Score to run the 22-signal engine.
                </div>
              )
            ) : selectedLead.latest_enrichment ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200 dark:border-obsidian-700">
                    <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Engine</span>
                    <span className="font-semibold text-slate-900 dark:text-white">Local Native Safe Crawler</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200 dark:border-obsidian-700">
                    <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Response Time</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {selectedLead.latest_enrichment.evidence.load_time_ms} ms
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200 dark:border-obsidian-700">
                    <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Security</span>
                    <span className="font-semibold text-lilac-700 dark:text-lilac-300 font-mono">
                      {selectedLead.latest_enrichment.evidence.ssl_valid ? "TLS / HTTPS" : "Insecure"}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200 dark:border-obsidian-700 space-y-1">
                  <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Title</span>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {selectedLead.latest_enrichment.evidence.title || "No page title detected"}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200 dark:border-obsidian-700 space-y-1">
                  <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Meta Description</span>
                  <p className="text-slate-600 dark:text-slate-300">
                    {selectedLead.latest_enrichment.evidence.meta_description || "No description found"}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-obsidian-800 rounded-2xl border border-slate-200 dark:border-obsidian-700 space-y-2">
                  <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400 font-bold block">Detected Technologies</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLead.latest_enrichment.evidence.detected_tech?.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold bg-lilac-100 dark:bg-lilac-950/60 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-lilac-800">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">No website scan record found for this prospect.</p>
            )}

            <div className="text-right pt-3 border-t border-slate-200 dark:border-obsidian-700">
              <button
                onClick={() => setSelectedLead(null)}
                className="btn-obsidian px-4 py-1.5 rounded-xl text-xs font-semibold"
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
