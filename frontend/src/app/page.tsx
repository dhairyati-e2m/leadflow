import React from "react";

export default function DashboardPage() {
  const providerModes = [
    { name: "Website Crawler & SSRF Guard", mode: "live", status: "Active (Local native execution)" },
    { name: "22-Signal Scoring Engine", mode: "live", status: "Active (Deterministic mathematical model)" },
    { name: "Lead Sourcing & Ingestion", mode: "live", status: "Active (Local CSV parser & sanitization)" },
    { name: "External Enrichment Provider", mode: "mock", status: "Mock mode (Deterministic local data)" },
    { name: "Google PageSpeed Insights", mode: "disabled", status: "Disabled (Awaiting free API key in .env)" },
    { name: "HubSpot CRM Synchronization", mode: "disabled", status: "Disabled (Awaiting authorized connection)" },
    { name: "AI Outreach Personalization", mode: "disabled", status: "Disabled (Falling back to deterministic copy)" },
  ];

  const signals = [
    { key: "legacy_platform", cat: "Website", name: "Legacy Platform", desc: "Outdated CMS/tech stack detection", weight: 1.0 },
    { key: "slow_site", cat: "Website", name: "Slow Site", desc: "Measured page latency & weight", weight: 1.2 },
    { key: "old_design", cat: "Website", name: "Old Design", desc: "Visual/semantic structure assessment", weight: 0.8 },
    { key: "weak_ctas", cat: "Website", name: "Weak CTAs", desc: "Missing conversion buttons & forms", weight: 1.2 },
    { key: "not_mobile_friendly", cat: "Website", name: "Not Mobile Friendly", desc: "Viewport meta & responsiveness cues", weight: 1.5 },
    { key: "no_ssl", cat: "Website", name: "No SSL / HTTPS", desc: "HTTPS enforcement & certificate validation", weight: 1.5 },
    { key: "thin_content", cat: "Website", name: "Thin Content", desc: "Meaningful body text volume & density", weight: 1.0 },
    { key: "no_analytics", cat: "Website", name: "No Modern Analytics", desc: "GA4, GTM, Plausible, PostHog check", weight: 0.8 },
    { key: "accessibility", cat: "Website", name: "Accessibility Issues", desc: "Automated WCAG heuristics (alt, aria, lang)", weight: 0.8 },
    { key: "no_live_chat", cat: "Website", name: "No Live Chat", desc: "Conversational conversion widgets", weight: 0.7 },
    { key: "poor_seo", cat: "Marketing", name: "Poor SEO Fundamentals", desc: "Title, meta desc, canonical, H1 hierarchy", weight: 1.2 },
    { key: "poor_aeo_geo", cat: "Marketing", name: "Poor AEO / Schema Data", desc: "JSON-LD structured data for answer graphs", weight: 1.0 },
    { key: "low_domain_trust", cat: "Marketing", name: "Low Domain Trust", desc: "Observable domain maturity & TLD risks", weight: 0.8 },
    { key: "stale_blog", cat: "Marketing", name: "Stale Blog / Content", desc: "Blog presence and publication freshness", weight: 0.9 },
    { key: "no_press", cat: "Marketing", name: "No Press / Newsroom", desc: "Newsroom links and media releases", weight: 0.6 },
    { key: "no_case_studies", cat: "Marketing", name: "No Case Studies / Proof", desc: "Client testimonials and case stories", weight: 1.2 },
    { key: "no_video", cat: "Marketing", name: "No Embedded Video", desc: "YouTube, Vimeo, product video content", weight: 0.6 },
    { key: "weak_social", cat: "Marketing", name: "Weak Social Presence", desc: "Official LinkedIn, Twitter, GitHub links", weight: 0.8 },
    { key: "weak_email_capture", cat: "Marketing", name: "Weak Email Capture", desc: "Newsletter signup and opt-in forms", weight: 1.0 },
    { key: "ppc_spend", cat: "Marketing", name: "Paid Ad Retargeting", desc: "Meta Pixel, Google Ads, LinkedIn Tag", weight: 0.9 },
    { key: "hiring", cat: "Marketing", name: "Active Hiring", desc: "Careers page presence and ATS integration", weight: 1.1 },
    { key: "low_review_rating", cat: "Marketing", name: "Review Rating & Proof", desc: "Verified review score (never fabricated)", weight: 1.0 },
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lead Qualification Dashboard</h1>
            <p className="text-slate-600 mt-1">
              Multi-tenant B2B prospect discovery, 22-signal deterministic scoring, and human approval workflow.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
              FastAPI Core Online
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              PostgreSQL Schema Ready
            </span>
          </div>
        </div>
      </div>

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

      {/* 22-Signal Qualification Specification Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              The 22-Signal Qualification Catalog
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Deterministic 0–100 normalized scoring with explicit missing-data semantics.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs">
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md font-semibold border border-blue-200">
              10 Website Signals
            </span>
            <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-md font-semibold border border-purple-200">
              12 Marketing Signals
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map((s, idx) => (
            <div
              key={s.key}
              className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors bg-white"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    s.cat === "Website"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-purple-50 text-purple-700"
                  }`}
                >
                  {s.cat}
                </span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-1">{s.name}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.desc}</p>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono">{s.key}</span>
                <span className="font-semibold text-slate-700">Weight: {s.weight}x</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
