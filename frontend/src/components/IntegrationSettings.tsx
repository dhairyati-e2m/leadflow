"use client";

import React, { useEffect, useState } from "react";
import {
  fetchIntegrationSettings,
  updateIntegrationSettings,
  ProviderControlItem,
  IntegrationSettingsResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

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
    key: "hunter",
    name: "Hunter.io Domain Search",
    category: "Email Verification",
    enabled: false,
    mode: "disabled",
    free_quota_description: "25 searches / month (Strict free safety budget)",
    is_configured: false,
    status_label: "Quota-capped free tier",
  },
  {
    key: "apollo",
    name: "Apollo.io API",
    category: "Lead Enrichment",
    enabled: false,
    mode: "disabled",
    free_quota_description: "API restricted to paid tiers ($49+/mo). Free web exports only.",
    is_configured: false,
    status_label: "Disabled by Policy (No free API)",
  },
  {
    key: "snov",
    name: "Snov.io API",
    category: "Contact Discovery",
    enabled: false,
    mode: "disabled",
    free_quota_description: "One-time 50 credit trial upon sign-up (No permanent free tier).",
    is_configured: false,
    status_label: "Disabled by Policy (Paid after trial)",
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
  {
    key: "openrouter",
    name: "OpenRouter AI Personalization",
    category: "Outreach Drafting",
    enabled: false,
    mode: "disabled",
    free_quota_description: "Free models (20 req/min, 200/day). Deterministic fallback active.",
    is_configured: false,
    status_label: "Disabled (Deterministic rules active)",
  },
];

export function IntegrationSettings() {
  const { user } = useAuth();
  const [masterEnabled, setMasterEnabled] = useState<boolean>(true);
  const [providers, setProviders] = useState<ProviderControlItem[]>(FALLBACK_PROVIDERS);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSettings() {
      try {
        setLoading(true);
        const data: IntegrationSettingsResponse = await fetchIntegrationSettings();
        if (isMounted) {
          setMasterEnabled(data.master_switch_enabled);
          setProviders(data.providers);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.info("Using default provider configuration:", err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSettings();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleToggleMaster = async () => {
    if (!user) {
      setMessage({
        text: "Please sign in to change workspace integration settings.",
        type: "info",
      });
      return;
    }

    const nextState = !masterEnabled;
    setSavingKey("master");
    setMessage(null);

    try {
      const res = await updateIntegrationSettings({ master_switch_enabled: nextState });
      setMasterEnabled(res.master_switch_enabled);
      setProviders(res.providers);
      setMessage({
        text: nextState
          ? "Master Switch enabled: safe external queries allowed within free limits."
          : "Master Switch disabled: all external API traffic paused. Local analyzers active.",
        type: "success",
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update master switch";
      setMessage({ text: errorMsg, type: "error" });
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleProvider = async (providerKey: string, currentEnabled: boolean) => {
    if (!user) {
      setMessage({
        text: "Please sign in to configure provider switches.",
        type: "info",
      });
      return;
    }

    if (providerKey === "apollo" || providerKey === "snov") {
      setMessage({
        text: `Cannot enable ${providerKey === "apollo" ? "Apollo.io" : "Snov.io"}: blocked by policy because it lacks a permanent free API tier.`,
        type: "error",
      });
      return;
    }

    if (providerKey === "safe_crawler") {
      setMessage({
        text: "The Local Web Scanner is built-in and always active to provide baseline site analysis.",
        type: "info",
      });
      return;
    }

    setSavingKey(providerKey);
    setMessage(null);

    try {
      const res = await updateIntegrationSettings({
        provider_toggles: {
          [providerKey]: !currentEnabled,
        },
      });
      setMasterEnabled(res.master_switch_enabled);
      setProviders(res.providers);
      setMessage({
        text: `Provider ${providerKey} updated successfully.`,
        type: "success",
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update provider toggle";
      setMessage({ text: errorMsg, type: "error" });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Policy Explanation Banner */}
      <div className="glass-panel rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-lilac-500 animate-pulse"></span>
              <h2 className="text-xl font-bold text-obsidian tracking-tight">Provider Controls & Quota Guard</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-blush-100 text-blush-600 border border-blush-200">
                Zero-Cost Policy
              </span>
            </div>
            <p className="text-obsidian/70 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
              Granular control over external data integrations. Every provider is bounded by hard-coded zero-cost safety limits and local fallbacks.
            </p>
          </div>

          {/* Futuristic Master Switch Pill */}
          <div className="flex items-center space-x-4 bg-cosmic-100/90 border border-cosmic-300 rounded-2xl px-5 py-3 shadow-sm">
            <div>
              <div className="text-xs font-bold text-obsidian tracking-tight">Master External Switch</div>
              <div className="text-[10px] font-mono text-obsidian/60 mt-0.5">
                {masterEnabled ? "Live connections enabled" : "All external APIs paused"}
              </div>
            </div>
            <button
              type="button"
              disabled={savingKey === "master"}
              onClick={handleToggleMaster}
              className={`relative inline-flex h-6 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-lilac-400 focus:ring-offset-2 ${
                masterEnabled ? "bg-obsidian" : "bg-cosmic-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-cosmic-50 shadow-md ring-0 transition duration-200 ease-in-out ${
                  masterEnabled ? "translate-x-6 bg-lilac-300" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Free Plan Guarantee Callout */}
        <div className="mt-5 p-3.5 bg-lilac-50/70 border border-lilac-200/80 rounded-2xl text-xs text-obsidian/90 flex items-start gap-3">
          <span className="text-base leading-none mt-0.5 text-lilac-600">✦</span>
          <div className="leading-relaxed">
            <span className="font-bold text-obsidian">Zero-Cost Policy:</span> LeadFlow will never incur cloud billing surprises. Providers lacking permanent free tiers (Apollo.io, Snov.io) are locked by policy. When free daily limits are reached, the platform switches seamlessly to local native execution.
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 p-3.5 rounded-2xl text-xs font-medium border ${
              message.type === "success"
                ? "bg-blush-50 text-obsidian border-blush-300"
                : message.type === "error"
                ? "bg-rose-50 text-rose-900 border-rose-200"
                : "bg-cosmic-100 text-obsidian border-cosmic-300"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((p) => {
          const isPolicyBlocked = p.key === "apollo" || p.key === "snov";
          const isNative = p.key === "safe_crawler";
          const isSaving = savingKey === p.key;

          return (
            <div
              key={p.key}
              className={`rounded-3xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 border border-lilac-300/90 dark:border-lilac-700 bg-white/95 dark:bg-obsidian-900 shadow-sm hover:bg-lilac-50/75 dark:hover:bg-lilac-950/30 hover:border-lilac-400 hover:shadow-futuristic-hover ${
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
                        ? "bg-sky-50 text-sky-700 border-sky-200"
                        : p.enabled && masterEnabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {isPolicyBlocked ? "Policy Locked" : p.enabled && masterEnabled ? "Active" : "Disabled"}
                  </span>
                </div>

                {/* Provider Title */}
                <h3 className="font-bold text-sm text-obsidian mb-1.5 tracking-tight">{p.name}</h3>

                {/* Free Quota Allowance Badge */}
                <div className="p-3 bg-cosmic-100/80 border border-cosmic-200/90 rounded-2xl text-xs space-y-1 mb-3.5">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-obsidian/50 font-bold">
                    Free Allowance:
                  </div>
                  <div className="text-obsidian/90 font-medium leading-snug">{p.free_quota_description}</div>
                </div>

                <p className="text-[11px] text-obsidian/60 mb-5 leading-normal">{p.status_label}</p>
              </div>

              {/* Action Button & Toggle */}
              <div className="pt-3.5 border-t border-cosmic-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-obsidian/80">
                  {isNative ? "Built-in Engine" : isPolicyBlocked ? "Paid API Blocked" : "Enable Integration"}
                </span>

                {isNative ? (
                  <span className="text-xs font-bold text-obsidian flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-lilac-500"></span> Always Active
                  </span>
                ) : isPolicyBlocked ? (
                  <span className="text-xs font-mono font-bold text-obsidian/50 flex items-center gap-1">
                    🔒 Zero-Cost Protected
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving || !masterEnabled}
                    onClick={() => handleToggleProvider(p.key, p.enabled)}
                    className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      !masterEnabled
                        ? "bg-cosmic-300 cursor-not-allowed opacity-50"
                        : p.enabled
                        ? "bg-obsidian"
                        : "bg-cosmic-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-cosmic-50 shadow-sm ring-0 transition duration-200 ease-in-out ${
                        p.enabled && masterEnabled ? "translate-x-5 bg-lilac-300" : "translate-x-0"
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quota Safeguards Technical Card */}
      <div className="glass-panel border border-blush-200/80 rounded-3xl p-6 text-xs text-obsidian/80 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-obsidian font-bold text-sm tracking-tight">Active Budget Protection Architecture</span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-cosmic-200 text-obsidian/70 uppercase">
            SaaS Guard
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="p-3.5 rounded-2xl bg-cosmic-100/70 border border-cosmic-200/80 space-y-1">
            <div className="font-bold text-obsidian">1. Redis Token Bucket</div>
            <p className="text-[11px] text-obsidian/70 leading-relaxed">
              Every query deducts tokens from a Redis token bucket. Queries pause automatically before exceeding vendor limits.
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-cosmic-100/70 border border-cosmic-200/80 space-y-1">
            <div className="font-bold text-obsidian">2. Seamless Native Fallback</div>
            <p className="text-[11px] text-obsidian/70 leading-relaxed">
              If an external service is unavailable or reaches daily limits, LeadFlow scores with native crawler heuristics.
            </p>
          </div>
          <div className="p-3.5 rounded-2xl bg-cosmic-100/70 border border-cosmic-200/80 space-y-1">
            <div className="font-bold text-obsidian">3. Hard Spending Ceiling</div>
            <p className="text-[11px] text-obsidian/70 leading-relaxed">
              No payment card information is stored. Automatic background batch jobs can never trigger unapproved charges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
