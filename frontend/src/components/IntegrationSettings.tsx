"use client";

import React, { useEffect, useState } from "react";
import {
  fetchIntegrationSettings,
  updateIntegrationSettings,
  fetchHubSpotStatus,
  getHubSpotAuthorizeUrl,
  disconnectHubSpot,
  HubSpotStatusResponse,
  ProviderControlItem,
  IntegrationSettingsResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { TransferAdminModal } from "@/components/TransferAdminModal";

interface DeterministicSignalItem {
  key: string;
  name: string;
  category: "website" | "marketing";
  groupLabel: string;
  algorithm: string;
  description: string;
  defaultWeight: number;
}

const FALLBACK_PROVIDERS: ProviderControlItem[] = [
  {
    key: "safe_crawler",
    name: "Local Safe Web Scanner",
    category: "Crawling & Tech Detection",
    enabled: true,
    mode: "live",
    free_quota_description: "Unlimited local execution (Zero external API cost)",
    is_configured: true,
    status_label: "Active (Local native engine)",
  },
  {
    key: "brave",
    name: "Brave Search API",
    category: "Search & Company Discovery",
    enabled: false,
    mode: "disabled",
    free_quota_description: "2,000 queries / month free (1 req/sec). Safety limit: 1,600/mo.",
    is_configured: false,
    status_label: "Ready to configure with free API key",
  },
  {
    key: "gemini",
    name: "Google Gemini API (gemini-1.5-flash)",
    category: "ICP Matching & Signal AI",
    enabled: false,
    mode: "disabled",
    free_quota_description: "1,500 requests/day, 15 RPM free recurring. Deterministic fallback active.",
    is_configured: false,
    status_label: "Ready to configure with free API key",
  },
  {
    key: "serpapi",
    name: "SerpApi Google Search",
    category: "Company Discovery",
    enabled: false,
    mode: "disabled",
    free_quota_description: "100 searches / month free recurring. Safety limit: 80/mo.",
    is_configured: false,
    status_label: "Ready to configure with free API key",
  },
  {
    key: "hunter",
    name: "Hunter.io Domain Search & Verification",
    category: "Email Discovery & Verification",
    enabled: false,
    mode: "disabled",
    free_quota_description: "25 searches + 50 verifications/mo free. Gated to explicit contact reveal.",
    is_configured: false,
    status_label: "Quota-capped free tier",
  },
  {
    key: "resend",
    name: "Resend Transactional Email",
    category: "Security & J5 Password Reset",
    enabled: false,
    mode: "disabled",
    free_quota_description: "100 emails / day free recurring (Safety limit: 80/day). Strictly transactional.",
    is_configured: false,
    status_label: "Ready to configure with free API key",
  },
  {
    key: "google_pagespeed",
    name: "Google PageSpeed Insights",
    category: "Core Web Vitals & Performance",
    enabled: false,
    mode: "disabled",
    free_quota_description: "25,000 queries / day (Free Google Cloud API Key, no credit card required)",
    is_configured: false,
    status_label: "Ready to configure with free API key",
  },
  {
    key: "hubspot",
    name: "HubSpot CRM Synchronization",
    category: "CRM Integration",
    enabled: false,
    mode: "disabled",
    free_quota_description: "Free Developer Test Account (100 req / 10s)",
    is_configured: false,
    status_label: "Awaiting developer authorization",
  },
];

const DETERMINISTIC_SIGNALS: DeterministicSignalItem[] = [
  // Website Architecture & Performance Signals (1-10)
  {
    key: "legacy_platform",
    name: "Modern Jamstack & Platform",
    category: "website",
    groupLabel: "Website Architecture",
    algorithm: "Native DOM & Script Analyzer",
    description: "Detects modern Jamstack frameworks (Next.js, Vercel, Gatsby) vs legacy platforms.",
    defaultWeight: 1.5,
  },
  {
    key: "slow_site",
    name: "Fast Page Load Latency",
    category: "website",
    groupLabel: "Website Performance",
    algorithm: "HTTP Time-to-First-Byte Scanner",
    description: "Evaluates raw server response time and static asset download latency.",
    defaultWeight: 1.3,
  },
  {
    key: "old_design",
    name: "Responsive Modern Layout",
    category: "website",
    groupLabel: "Website Architecture",
    algorithm: "Semantic HTML5 Structural Validator",
    description: "Analyzes semantic HTML5 layout tags, modern flexbox/grid containers, and CSS viewports.",
    defaultWeight: 1.0,
  },
  {
    key: "weak_ctas",
    name: "Call-to-Action (CTA) Prominence",
    category: "website",
    groupLabel: "Conversion Funnel",
    algorithm: "Heuristic Button & Form Scraper",
    description: "Discovers high-intent conversion buttons, demo request forms, and trial sign-ups above the fold.",
    defaultWeight: 1.0,
  },
  {
    key: "not_mobile_friendly",
    name: "Mobile Viewport Responsiveness",
    category: "website",
    groupLabel: "Mobile Experience",
    algorithm: "Meta Viewport & Breakpoint Inspector",
    description: "Verifies responsive mobile viewport configuration across smartphone screen widths.",
    defaultWeight: 0.8,
  },
  {
    key: "no_ssl",
    name: "TLS / SSL Security Protocol",
    category: "website",
    groupLabel: "Security & Trust",
    algorithm: "OpenSSL Handshake & HSTS Validator",
    description: "Confirms valid TLS security certificates and enforced HTTPS protocol redirection.",
    defaultWeight: 1.2,
  },
  {
    key: "thin_content",
    name: "Homepage Content & Word Depth",
    category: "website",
    groupLabel: "Content Strategy",
    algorithm: "Text Density & Word Count Engine",
    description: "Evaluates informational depth, value propositions, and corporate copy density.",
    defaultWeight: 0.7,
  },
  {
    key: "no_analytics",
    name: "Analytics & Tracking Stack",
    category: "website",
    groupLabel: "Measurement Stack",
    algorithm: "Script & Tag Regex Detector",
    description: "Detects Google Tag Manager, Google Analytics 4, Mixpanel, and behavioral analytics.",
    defaultWeight: 0.6,
  },
  {
    key: "accessibility",
    name: "Accessibility & WCAG Contrast",
    category: "website",
    groupLabel: "Usability Standards",
    algorithm: "Image Alt & ARIA Heuristic Audit",
    description: "Verifies alt attribute coverage on images, ARIA roles, and standard accessibility compliance.",
    defaultWeight: 0.6,
  },
  {
    key: "no_live_chat",
    name: "Customer Live Chat Widget",
    category: "website",
    groupLabel: "Customer Engagement",
    algorithm: "Chat SDK Signature Matcher",
    description: "Detects active customer support widgets such as Intercom, Drift, Crisp, or Zendesk.",
    defaultWeight: 0.5,
  },
  // Market Authority & Growth Signals (11-22)
  {
    key: "poor_seo",
    name: "Search Engine (SEO) Fundamentals",
    category: "marketing",
    groupLabel: "Search Authority",
    algorithm: "Meta Tag & Robots.txt Parser",
    description: "Inspects optimized title tags, canonical URLs, meta descriptions, and crawl directives.",
    defaultWeight: 1.4,
  },
  {
    key: "poor_aeo_geo",
    name: "Schema.org Structured Data",
    category: "marketing",
    groupLabel: "Search Authority",
    algorithm: "JSON-LD & Microdata Extractor",
    description: "Extracts Organization, LocalBusiness, and Corporation schema for AI & search engines.",
    defaultWeight: 1.0,
  },
  {
    key: "low_domain_trust",
    name: "Domain Reputation & DNS Health",
    category: "marketing",
    groupLabel: "Brand Infrastructure",
    algorithm: "DNS Record & MX/SPF Auditor",
    description: "Validates top-level domain age, trusted TLD registry, and verified MX mail records.",
    defaultWeight: 0.6,
  },
  {
    key: "stale_blog",
    name: "Editorial Blog & Resource Freshness",
    category: "marketing",
    groupLabel: "Inbound Marketing",
    algorithm: "RSS Feed & Date Publication Scraper",
    description: "Detects recent technical articles, thought leadership posts, and release announcements.",
    defaultWeight: 1.1,
  },
  {
    key: "no_press",
    name: "Press & Newsroom Publications",
    category: "marketing",
    groupLabel: "Market Recognition",
    algorithm: "Media Room & PR Link Dissector",
    description: "Identifies dedicated press releases, media kits, and corporate news announcements.",
    defaultWeight: 0.7,
  },
  {
    key: "no_case_studies",
    name: "Client Case Studies & Social Proof",
    category: "marketing",
    groupLabel: "Commercial Traction",
    algorithm: "Customer Logo & Proof Heuristic",
    description: "Discovers verified case studies, testimonial quotes, and customer enterprise proof points.",
    defaultWeight: 0.8,
  },
  {
    key: "no_video",
    name: "Product Demos & Video Content",
    category: "marketing",
    groupLabel: "Product Presentation",
    algorithm: "Video Embed & Iframe Sniffer",
    description: "Verifies product walkthroughs and explainer videos (YouTube, Vimeo, Wistia).",
    defaultWeight: 0.5,
  },
  {
    key: "weak_social",
    name: "Verified Executive & Brand Socials",
    category: "marketing",
    groupLabel: "Social Presence",
    algorithm: "Corporate Social Link Verifier",
    description: "Verifies active links to company LinkedIn, GitHub, and verified industry profiles.",
    defaultWeight: 0.9,
  },
  {
    key: "weak_email_capture",
    name: "Newsletter & Content Capture",
    category: "marketing",
    groupLabel: "Lead Generation",
    algorithm: "Lead Capture Form Matcher",
    description: "Detects newsletter subscriptions, whitepaper downloads, and gated content forms.",
    defaultWeight: 0.6,
  },
  {
    key: "ppc_spend",
    name: "Digital Ad Remarketing Pixels",
    category: "marketing",
    groupLabel: "Paid Growth",
    algorithm: "Ad Network Pixel Fingerprinter",
    description: "Discovers LinkedIn Insight Tag, Meta Pixel, and Google Ads remarketing snippets.",
    defaultWeight: 1.2,
  },
  {
    key: "hiring",
    name: "Active Career Expansion & Jobs",
    category: "marketing",
    groupLabel: "Company Growth",
    algorithm: "Careers Portal Link Finder",
    description: "Identifies open job postings, engineering hiring, and Greenhouse/Lever/Workday integrations.",
    defaultWeight: 1.1,
  },
  {
    key: "low_review_rating",
    name: "Review Authority Badges",
    category: "marketing",
    groupLabel: "Reputation & Sentiment",
    algorithm: "Review Platform Badge Scanner",
    description: "Detects G2 Crowd, Capterra, and Trustpilot rating badges and review trust seals.",
    defaultWeight: 0.8,
  },
];

export function IntegrationSettings() {
  const { user, activeMembership } = useAuth();
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [masterEnabled, setMasterEnabled] = useState<boolean>(true);
  const [providers, setProviders] = useState<ProviderControlItem[]>(FALLBACK_PROVIDERS);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeSignalFilter, setActiveSignalFilter] = useState<"all" | "website" | "marketing">("all");
  const [hubspotStatus, setHubspotStatus] = useState<HubSpotStatusResponse | null>(null);
  const [isHubSpotActionLoading, setIsHubSpotActionLoading] = useState<boolean>(false);

  // Signal weights state
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initWeights: Record<string, number> = {};
    FALLBACK_PROVIDERS.forEach((p) => {
      initWeights[p.key] = p.key === "safe_crawler" ? 1.5 : p.key === "google_pagespeed" ? 1.3 : 1.0;
    });
    DETERMINISTIC_SIGNALS.forEach((s) => {
      initWeights[s.key] = s.defaultWeight;
    });
    return initWeights;
  });

  // Always styled as light red
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSettings() {
      try {
        setLoading(true);
        const [data, hsData] = await Promise.all([
          fetchIntegrationSettings().catch((e) => {
            console.info("Using default provider configuration:", e);
            return null;
          }),
          fetchHubSpotStatus().catch((e) => {
            console.info("HubSpot status fetch failed:", e);
            return null;
          }),
        ]);

        if (isMounted) {
          if (data) {
            setMasterEnabled(data.master_switch_enabled);
            setProviders(data.providers);
          }
          if (hsData) {
            setHubspotStatus(hsData);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSettings();

    // Check for callback query params in browser URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("hubspot_connected") === "true") {
        const portal = params.get("portal_id");
        showNotification(
          portal
            ? `HubSpot CRM connected successfully (Portal ID: ${portal})!`
            : "HubSpot CRM connected successfully!"
        );
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get("hubspot_error")) {
        showNotification(`HubSpot OAuth Error: ${params.get("hubspot_error")}`);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [user]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4500);
  };

  const handleConnectHubSpot = async () => {
    if (!user) {
      showNotification("Please sign in to connect HubSpot.");
      return;
    }
    try {
      setIsHubSpotActionLoading(true);
      const res = await getHubSpotAuthorizeUrl();
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to initiate HubSpot connection";
      showNotification(errorMsg);
    } finally {
      setIsHubSpotActionLoading(false);
    }
  };

  const handleDisconnectHubSpot = async () => {
    if (!user) return;
    try {
      setIsHubSpotActionLoading(true);
      await disconnectHubSpot();
      const updated = await fetchHubSpotStatus();
      setHubspotStatus(updated);
      showNotification("HubSpot CRM disconnected successfully.");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to disconnect HubSpot";
      showNotification(errorMsg);
    } finally {
      setIsHubSpotActionLoading(false);
    }
  };

  const handleToggleMaster = async () => {
    if (!user) {
      showNotification("Please sign in to change workspace integration settings.");
      return;
    }

    const nextState = !masterEnabled;
    setSavingKey("master");

    try {
      const res = await updateIntegrationSettings({ master_switch_enabled: nextState });
      setMasterEnabled(res.master_switch_enabled);
      setProviders(res.providers);
      showNotification(
        nextState
          ? "Master Switch enabled: safe external queries allowed within free limits."
          : "Master Switch disabled: all external API traffic paused. Local analyzers active."
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update master switch";
      showNotification(errorMsg);
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleProvider = async (providerKey: string, currentEnabled: boolean) => {
    if (!user) {
      showNotification("Please sign in to configure provider switches.");
      return;
    }

    if (providerKey === "apollo" || providerKey === "snov" || providerKey === "dataforseo") {
      showNotification(
        `Cannot enable ${providerKey}: blocked by policy because it lacks a permanent free API tier.`
      );
      return;
    }

    if (providerKey === "safe_crawler") {
      showNotification("The Local Web Scanner is built-in and always active to provide baseline site analysis.");
      return;
    }

    setSavingKey(providerKey);

    try {
      const res = await updateIntegrationSettings({
        provider_toggles: {
          [providerKey]: !currentEnabled,
        },
      });
      setMasterEnabled(res.master_switch_enabled);
      setProviders(res.providers);
      showNotification(`Provider ${providerKey} updated successfully.`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update provider toggle";
      showNotification(errorMsg);
    } finally {
      setSavingKey(null);
    }
  };

  const [auditLogEntries, setAuditLogEntries] = useState<Array<{ timestamp: string; operator: string; action: string }>>([]);

  const handleAdjustWeight = (key: string, name: string, delta: number) => {
    const operatorIdentity = user?.email || user?.full_name || "Authorized Operator";
    setWeights((prev) => {
      const current = prev[key] ?? 1.0;
      const next = Math.max(0.1, Math.min(3.0, Math.round((current + delta) * 10) / 10));
      const logMsg = `Weight for "${name}" updated to ${next.toFixed(1)}x by ${operatorIdentity}`;
      showNotification(`${logMsg} [Audit Logged]`);
      setAuditLogEntries((old) => [
        {
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          operator: operatorIdentity,
          action: `Tuned "${name}" from ${current.toFixed(1)}x to ${next.toFixed(1)}x`,
        },
        ...old.slice(0, 19),
      ]);
      return { ...prev, [key]: next };
    });
  };

  const filteredDeterministicSignals = DETERMINISTIC_SIGNALS.filter((s) => {
    if (activeSignalFilter === "all") return true;
    return s.category === activeSignalFilter;
  });

  return (
    <div className="space-y-8">
      {/* Floating Notification Toast Popup (Top-Right, Light Red) */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 max-w-sm sm:max-w-md p-4 rounded-2xl text-xs font-semibold bg-rose-50/95 dark:bg-rose-950/95 border border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-200 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0"></span>
            <span className="leading-snug">{notification}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-rose-700 dark:text-rose-300 hover:text-rose-950 dark:hover:text-white font-bold text-base px-1 transition-colors"
            title="Dismiss notification"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header & Policy Explanation Banner */}
      <div className="glass-panel card-cosmic rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-lilac-500 animate-pulse"></span>
              <h2 className="text-xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                Signal Engines & Integration Hub
              </h2>
            </div>
            <p className="text-obsidian/70 dark:text-cosmic-300 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
              Granular controls for external live API providers alongside all 22 deterministic native scoring signals and interactive weight multipliers.
            </p>
          </div>

          {/* Master External Switch Pill */}
          <div className="flex items-center space-x-4 bg-cosmic-100/90 dark:bg-obsidian-800 border border-cosmic-300 dark:border-obsidian-700 rounded-2xl px-5 py-3 shadow-sm">
            <div>
              <div className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">Master External Switch</div>
              <div className="text-[10px] font-mono text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                {masterEnabled ? "Live connections enabled" : "All external APIs paused"}
              </div>
            </div>
            <button
              type="button"
              disabled={savingKey === "master"}
              onClick={handleToggleMaster}
              className={`relative inline-flex h-6 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-lilac-400 focus:ring-offset-2 ${
                masterEnabled ? "bg-obsidian dark:bg-lilac-600" : "bg-cosmic-300 dark:bg-obsidian-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-md ring-0 transition duration-200 ease-in-out ${
                  masterEnabled
                    ? "translate-x-6 bg-lilac-300 dark:bg-obsidian-950"
                    : "translate-x-0 bg-cosmic-50 dark:bg-cosmic-300"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Free Plan Guarantee Callout (Dark Glass, Zero White Patches) */}
        <div className="mt-5 p-3.5 bg-lilac-50/70 dark:bg-obsidian-900/95 border border-lilac-200/80 dark:border-obsidian-700 rounded-2xl text-xs text-obsidian/90 dark:text-cosmic-200 flex items-start gap-3">
          <span className="text-base leading-none mt-0.5 text-lilac-600 dark:text-lilac-400">✦</span>
          <div className="leading-relaxed">
            <span className="font-bold text-obsidian dark:text-cosmic-100">Zero-Cost Policy Guarantee:</span> LeadFlow will never incur cloud billing surprises. Providers lacking permanent free tiers (Apollo.io, Snov.io) are locked by policy. When free daily limits are reached, the platform switches seamlessly to local native execution.
          </div>
        </div>
      </div>

      {/* SECTION 1: External Live API Integrations */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cosmic-200 dark:border-obsidian-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-lilac-500"></span>
              <h3 className="text-base font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                1. External Live API Providers & Rate Limits
              </h3>
            </div>
            <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
              Strictly bounded cloud integrations with permanent free tiers, rate safety ceilings, and local fallbacks.
            </p>
          </div>
          <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-cosmic-100 dark:bg-obsidian-900 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-200 dark:border-obsidian-700">
            {providers.length} External Integrations
          </span>
        </div>

        {/* Provider Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => {
            const isPolicyBlocked = p.key === "apollo" || p.key === "snov" || p.key === "dataforseo";
            const isNative = p.key === "safe_crawler";
            const isSaving = savingKey === p.key;
            const currentWeight = weights[p.key] ?? 1.0;

            return (
              <div
                key={p.key}
                className={`rounded-3xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 border border-lilac-300/80 dark:border-lilac-400/40 bg-white/95 dark:bg-obsidian-900 shadow-sm hover:bg-lilac-50/75 dark:hover:bg-obsidian-800 hover:border-lilac-500 dark:hover:border-lilac-300 ${
                  isPolicyBlocked ? "opacity-90" : ""
                }`}
              >
                <div>
                  {/* Category & Status Pill (Item 6: Active = light green, Disabled = light yellow, Policy Locked = light blue) */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold">
                      {p.category}
                    </span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider border ${
                        isPolicyBlocked
                          ? "bg-sky-50 dark:bg-obsidian-900 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                          : p.key === "hubspot" && hubspotStatus?.connected
                          ? "bg-emerald-50 dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : p.enabled && masterEnabled
                          ? "bg-emerald-50 dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : "bg-amber-50 dark:bg-obsidian-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      }`}
                    >
                      {isPolicyBlocked
                        ? "Policy Locked"
                        : p.key === "hubspot"
                        ? hubspotStatus?.connected
                          ? "Connected"
                          : "Disconnected"
                        : p.enabled && masterEnabled
                        ? "Active"
                        : "Disabled"}
                    </span>
                  </div>

                  {/* Provider Title */}
                  <h4 className="font-bold text-sm text-obsidian dark:text-cosmic-100 mb-1.5 tracking-tight">{p.name}</h4>

                  {/* Free Quota Allowance Badge (Deep obsidian in dark mode) */}
                  {p.key === "hubspot" && hubspotStatus?.connected ? (
                    <div className="p-3 bg-emerald-50/70 dark:bg-obsidian-800/80 border border-emerald-200/90 dark:border-obsidian-700 rounded-2xl text-xs space-y-1.5 mb-3.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-between">
                        <span>Connected Portal:</span>
                        <span className="font-mono">{hubspotStatus.portal_id || "Active"}</span>
                      </div>
                      {hubspotStatus.hub_domain && (
                        <div className="text-[11px] text-obsidian/80 dark:text-cosmic-200 truncate">
                          {hubspotStatus.hub_domain}
                        </div>
                      )}
                      <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400">
                        Last Sync: {hubspotStatus.last_sync_at ? new Date(hubspotStatus.last_sync_at).toLocaleString() : "None yet"}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-cosmic-100/80 dark:bg-obsidian-800/80 border border-cosmic-200/90 dark:border-obsidian-700 rounded-2xl text-xs space-y-1 mb-3.5">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold">
                        Free Allowance:
                      </div>
                      <div className="text-obsidian/90 dark:text-cosmic-200 font-medium leading-snug">{p.free_quota_description}</div>
                    </div>
                  )}

                  <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mb-4 leading-normal">
                    {p.key === "hubspot"
                      ? hubspotStatus?.connected
                        ? "OAuth 2.0 active. Approved leads sync directly to contacts & companies."
                        : "Connect your HubSpot account via OAuth 2.0 to push approved leads."
                      : p.status_label}
                  </p>

                  {/* Interactive Weight Tuning Control (Item 4) */}
                  <div className="p-2.5 rounded-xl bg-cosmic-50/70 dark:bg-obsidian-800/60 border border-cosmic-200 dark:border-obsidian-700 flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-obsidian/60 dark:text-cosmic-400 font-bold">
                      Scoring Weight:
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(p.key, p.name, -0.1)}
                        className="w-5 h-5 rounded-md bg-cosmic-200 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-300 dark:hover:bg-obsidian-700 flex items-center justify-center font-bold text-xs border border-cosmic-300 dark:border-obsidian-700"
                        title="Decrease weight"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold px-1.5 text-obsidian dark:text-cosmic-100">
                        {currentWeight.toFixed(1)}x
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdjustWeight(p.key, p.name, 0.1)}
                        className="w-5 h-5 rounded-md bg-cosmic-200 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-300 dark:hover:bg-obsidian-700 flex items-center justify-center font-bold text-xs border border-cosmic-300 dark:border-obsidian-700"
                        title="Increase weight"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Button & Toggle */}
                <div className="pt-3 border-t border-cosmic-200 dark:border-obsidian-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-obsidian/80 dark:text-cosmic-300">
                      {isNative ? "Built-in Engine" : isPolicyBlocked ? "Paid API Blocked" : "Enable Integration"}
                    </span>

                    {isNative ? (
                      <span className="text-xs font-bold text-obsidian dark:text-cosmic-100 flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 rounded-full bg-lilac-500"></span> Always Active
                      </span>
                    ) : isPolicyBlocked ? (
                      <span className="text-xs font-mono font-bold text-obsidian/50 dark:text-cosmic-400 flex items-center gap-1">
                        🔒 Protected
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isSaving || !masterEnabled}
                        onClick={() => handleToggleProvider(p.key, p.enabled)}
                        className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          !masterEnabled
                            ? "bg-cosmic-300 dark:bg-obsidian-800 cursor-not-allowed opacity-50"
                            : p.enabled
                            ? "bg-obsidian dark:bg-lilac-600"
                            : "bg-cosmic-300 dark:bg-obsidian-800"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                            p.enabled && masterEnabled
                              ? "translate-x-5 bg-lilac-300 dark:bg-obsidian-950"
                              : "translate-x-0 bg-cosmic-50 dark:bg-cosmic-300"
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  {/* HubSpot OAuth Lifecycle Action Button */}
                  {p.key === "hubspot" && (
                    <div className="pt-1">
                      {hubspotStatus?.connected ? (
                        <button
                          type="button"
                          disabled={isHubSpotActionLoading}
                          onClick={handleDisconnectHubSpot}
                          className="w-full py-1.5 px-3 rounded-xl text-xs font-semibold border border-rose-300 dark:border-rose-900/80 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center justify-center gap-1.5"
                        >
                          {isHubSpotActionLoading ? "Disconnecting..." : "Disconnect HubSpot Account"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isHubSpotActionLoading || !masterEnabled}
                          onClick={handleConnectHubSpot}
                          className="btn-obsidian w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          {isHubSpotActionLoading ? (
                            <span>Connecting to HubSpot...</span>
                          ) : (
                            <>
                              <span className="text-sm">⚡</span>
                              <span>Connect HubSpot Account</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Deterministic Native Heuristic Signals (Item 4) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cosmic-200 dark:border-obsidian-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <h3 className="text-base font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                2. Deterministic & Native Heuristic Signals (22 Signals · Zero API Cost)
              </h3>
            </div>
            <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
              100% free local crawler heuristics, semantic DOM inspection, SSL verification, and metadata audits.
            </p>
          </div>

          {/* Group Filter Tabs */}
          <div className="flex items-center space-x-1 bg-cosmic-100/90 dark:bg-obsidian-800 p-1 rounded-xl border border-cosmic-300 dark:border-obsidian-700 text-xs">
            <button
              type="button"
              onClick={() => setActiveSignalFilter("all")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeSignalFilter === "all"
                  ? "bg-obsidian text-cosmic-100 dark:bg-obsidian-900 dark:text-cosmic-100"
                  : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
              }`}
            >
              All (22)
            </button>
            <button
              type="button"
              onClick={() => setActiveSignalFilter("website")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeSignalFilter === "website"
                  ? "bg-obsidian text-cosmic-100 dark:bg-obsidian-900 dark:text-cosmic-100"
                  : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
              }`}
            >
              Website (1-10)
            </button>
            <button
              type="button"
              onClick={() => setActiveSignalFilter("marketing")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeSignalFilter === "marketing"
                  ? "bg-obsidian text-cosmic-100 dark:bg-obsidian-900 dark:text-cosmic-100"
                  : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
              }`}
            >
              Marketing (11-22)
            </button>
          </div>
        </div>

        {/* Deterministic Signals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDeterministicSignals.map((sig) => {
            const currentWeight = weights[sig.key] ?? sig.defaultWeight;

            return (
              <div
                key={sig.key}
                className="rounded-3xl p-5 flex flex-col justify-between transition-all duration-200 border border-lilac-300/80 dark:border-lilac-400/40 bg-white/95 dark:bg-obsidian-900 shadow-sm hover:bg-lilac-50/75 dark:hover:bg-obsidian-800 hover:border-lilac-500 dark:hover:border-lilac-300"
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold">
                      {sig.groupLabel}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider bg-emerald-50 dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Local Native
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-obsidian dark:text-cosmic-100 mb-1 tracking-tight">{sig.name}</h4>

                  {/* Algorithm badge */}
                  <div className="mb-3">
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-cosmic-100 dark:bg-obsidian-800 text-obsidian/60 dark:text-cosmic-400 border border-cosmic-200 dark:border-obsidian-700">
                      {sig.algorithm}
                    </span>
                  </div>

                  <p className="text-xs text-obsidian/70 dark:text-cosmic-300 leading-relaxed mb-4">
                    {sig.description}
                  </p>
                </div>

                {/* Weight Adjustment Stepper (Item 4) */}
                <div className="pt-3 border-t border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400">
                    Rule Weight:
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => handleAdjustWeight(sig.key, sig.name, -0.1)}
                      className="w-5 h-5 rounded-md bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 flex items-center justify-center font-bold text-xs border border-cosmic-200 dark:border-obsidian-700"
                      title="Decrease weight"
                    >
                      -
                    </button>
                    <span className="font-mono text-xs font-bold px-1.5 text-obsidian dark:text-cosmic-100">
                      {currentWeight.toFixed(1)}x
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAdjustWeight(sig.key, sig.name, 0.1)}
                      className="w-5 h-5 rounded-md bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-200 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 flex items-center justify-center font-bold text-xs border border-cosmic-200 dark:border-obsidian-700"
                      title="Increase weight"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quota Safeguards Technical Architecture Card (Dark Glass, Zero White Patches) */}
      <div className="glass-panel border border-lilac-300/60 dark:border-lilac-400/30 rounded-3xl p-6 text-xs text-obsidian/80 dark:text-cosmic-300 space-y-3 shadow-sm dark:bg-obsidian-900/90">
        <div className="flex items-center gap-2">
          <span className="text-obsidian dark:text-cosmic-100 font-bold text-sm tracking-tight">Active Budget Protection Architecture</span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-cosmic-200 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-300 dark:border-obsidian-700 uppercase">
            SaaS Guard
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="p-3.5 rounded-2xl bg-cosmic-100/70 dark:bg-obsidian-800/80 border border-cosmic-200/80 dark:border-obsidian-700 space-y-1">
            <div className="font-bold text-obsidian dark:text-cosmic-100">1. Redis Token Bucket</div>
            <p className="text-[11px] text-obsidian/70 dark:text-cosmic-300 leading-relaxed">
              Every query deducts tokens from a Redis token bucket. Queries pause automatically before exceeding vendor limits.
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-cosmic-100/70 dark:bg-obsidian-800/80 border border-cosmic-200/80 dark:border-obsidian-700 space-y-1">
            <div className="font-bold text-obsidian dark:text-cosmic-100">2. Seamless Native Fallback</div>
            <p className="text-[11px] text-obsidian/70 dark:text-cosmic-300 leading-relaxed">
              If an external service is unavailable or reaches daily limits, LeadFlow scores with native crawler heuristics.
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-cosmic-100/70 dark:bg-obsidian-800/80 border border-cosmic-200/80 dark:border-obsidian-700 space-y-1">
            <div className="font-bold text-obsidian dark:text-cosmic-100">3. Hard Spending Ceiling</div>
            <p className="text-[11px] text-obsidian/70 dark:text-cosmic-300 leading-relaxed">
              No payment card information is stored. Automatic background batch jobs can never trigger unapproved charges.
            </p>
          </div>
        </div>
      </div>

      {/* Organisation Ownership & Administration Transfer Card (Feature 3) */}
      {(activeMembership?.role === "owner" || activeMembership?.role === "admin") && (
        <div className="glass-panel border border-lilac-300/60 dark:border-lilac-400/30 rounded-3xl p-6 text-xs text-obsidian/80 dark:text-cosmic-300 space-y-4 shadow-sm dark:bg-obsidian-900/90">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                <span className="text-obsidian dark:text-cosmic-100 font-bold text-sm tracking-tight">
                  Organisation Administration & Succession
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase">
                  Current Role: {activeMembership.role}
                </span>
              </div>
              <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1 max-w-2xl leading-relaxed">
                Transfer primary administrative control of <strong>{activeMembership.org_name}</strong> to another enrolled colleague. Role handovers are atomic and take effect immediately across all sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              <span>👑</span>
              <span>Transfer Administration</span>
            </button>
          </div>
        </div>
      )}

      {showTransferModal && activeMembership && (
        <TransferAdminModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          orgId={activeMembership.org_id}
          orgName={activeMembership.org_name}
        />
      )}
    </div>
  );
}
