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
        // Fall back to fallback providers when unauthenticated or offline
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
          ? "External integrations master switch enabled."
          : "External integrations master switch disabled. All external API requests paused.",
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

    // Safeguard for policy-blocked providers
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Data Providers & Integrations Control Center</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                100% Free Tier Policy
              </span>
            </div>
            <p className="text-slate-600 text-xs sm:text-sm mt-1">
              Control which external services LeadFlow communicates with. Every provider is strictly governed by zero-cost limits.
            </p>
          </div>

          {/* Master Switch Card */}
          <div className="flex items-center space-x-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <div>
              <div className="text-xs font-bold text-slate-800">Master Integration Switch</div>
              <div className="text-[11px] text-slate-500">
                {masterEnabled ? "External requests allowed" : "All external APIs paused"}
              </div>
            </div>
            <button
              type="button"
              disabled={savingKey === "master"}
              onClick={handleToggleMaster}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                masterEnabled ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  masterEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Free Plan Guarantee Callout */}
        <div className="mt-4 p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2.5">
          <span className="text-base leading-none">🛡️</span>
          <div>
            <span className="font-bold">Zero-Cost Guarantee:</span> LeadFlow is engineered to never incur unexpected cloud bills. Providers without genuine, permanent free tiers (such as Apollo.io and Snov.io) are blocked by policy. When services reach their daily free quota, they automatically pause and switch to local analysis.
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs font-medium border ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : message.type === "error"
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-blue-50 text-blue-800 border-blue-200"
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
              className={`rounded-xl border p-5 flex flex-col justify-between transition ${
                isPolicyBlocked
                  ? "bg-slate-50/70 border-slate-200 opacity-80"
                  : p.enabled && masterEnabled
                  ? "bg-white border-blue-200 shadow-sm ring-1 ring-blue-100"
                  : "bg-white border-slate-200"
              }`}
            >
              <div>
                {/* Provider Category & Status */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {p.category}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                      isPolicyBlocked
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : p.enabled && masterEnabled
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {isPolicyBlocked ? "Blocked by Policy" : p.enabled && masterEnabled ? "Active" : "Disabled"}
                  </span>
                </div>

                {/* Provider Title */}
                <h3 className="font-bold text-sm text-slate-900 mb-1">{p.name}</h3>

                {/* Free Quota Allowance */}
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs space-y-1 mb-3">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Free Tier Allowance:</div>
                  <div className="text-slate-700 font-medium">{p.free_quota_description}</div>
                </div>

                <p className="text-xs text-slate-500 mb-4">{p.status_label}</p>
              </div>

              {/* Provider Actions & Toggle */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  {isNative ? "Built-in Engine" : isPolicyBlocked ? "Paid API Blocked" : "Enable Integration"}
                </span>

                {isNative ? (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Always On
                  </span>
                ) : isPolicyBlocked ? (
                  <span className="text-xs font-bold text-rose-600 flex items-center gap-1" title="Protected against paid charges">
                    🔒 Protected
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving || !masterEnabled}
                    onClick={() => handleToggleProvider(p.key, p.enabled)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      !masterEnabled
                        ? "bg-slate-200 cursor-not-allowed opacity-60"
                        : p.enabled
                        ? "bg-blue-600"
                        : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        p.enabled && masterEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quota Safeguards Details */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-600 space-y-2">
        <h4 className="font-bold text-slate-800 text-sm">How LeadFlow Protects Your Budget</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Proactive Token Bucket:</strong> Each request deducts tokens from a local Redis token bucket. Requests are stopped before exceeding provider rate limits.</li>
          <li><strong>Automatic Local Fallback:</strong> If an external provider hits its daily free limit or returns an error (such as HTTP 429), LeadFlow immediately falls back to local website crawling without interrupting your work.</li>
          <li><strong>Hard Spending Cap:</strong> The system does not store or accept billing credentials. It is physically impossible for background processes to incur charges.</li>
        </ul>
      </div>
    </div>
  );
}
