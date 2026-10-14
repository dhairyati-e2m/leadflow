"use client";

import React, { useState, useEffect } from "react";
import {
  AudienceItem,
  AudienceFilters,
  FilterCatalogResponse,
  fetchFilterCatalog,
  fetchAudiences,
  createAudience,
  updateAudience,
  aiProposeIcp,
} from "@/lib/api";

const DEFAULT_FILTERS: AudienceFilters = {
  verticals: ["B2B SaaS & Enterprise Software"],
  vertical_match: "or",
  locations: ["United States (Nationwide)"],
  location_match: "or",
  headcount_ranges: ["11-50 employees", "51-200 employees"],
  exclude_locations: [],
  exclude_verticals: [],
  exclude_domains: [],
  exclude_existing_crm: true,
  negative_keywords: [],
};

export function IcpEditor() {
  const [catalog, setCatalog] = useState<FilterCatalogResponse | null>(null);
  const [audiences, setAudiences] = useState<AudienceItem[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string | null>(null);
  const [name, setName] = useState<string>("Primary Growth ICP");
  const [description, setDescription] = useState<string>("Core ideal customer profile targeting mid-market B2B software and tech-enabled services.");
  const [filters, setFilters] = useState<AudienceFilters>(DEFAULT_FILTERS);
  const [isDefault, setIsDefault] = useState<boolean>(true);

  // AI Propose state
  const [briefText, setBriefText] = useState<string>("");
  const [isProposing, setIsProposing] = useState<boolean>(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [poolDepth, setPoolDepth] = useState<string | null>(null);

  // UI state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [customKeyword, setCustomKeyword] = useState<string>("");

  useEffect(() => {
    async function loadData() {
      try {
        const [catData, audData] = await Promise.all([
          fetchFilterCatalog().catch(() => null),
          fetchAudiences().catch(() => []),
        ]);
        if (catData) setCatalog(catData);
        if (audData && audData.length > 0) {
          setAudiences(audData);
          const active = audData.find((a) => a.is_default) || audData[0];
          setSelectedAudienceId(active.id);
          setName(active.name);
          setDescription(active.description || "");
          setFilters(active.filters);
          setIsDefault(active.is_default);
        }
      } catch (err: unknown) {
        console.error("Failed to initialize ICP editor:", err);
      }
    }
    loadData();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4500);
  };

  const handleSelectAudience = (aud: AudienceItem) => {
    setSelectedAudienceId(aud.id);
    setName(aud.name);
    setDescription(aud.description || "");
    setFilters(aud.filters);
    setIsDefault(aud.is_default);
    setAiRationale(null);
    setPoolDepth(null);
    showNotification(`Loaded ICP Profile: "${aud.name}"`);
  };

  const handleCreateNew = () => {
    setSelectedAudienceId(null);
    setName("New ICP Target Profile");
    setDescription("Custom audience segment configured for automated qualification.");
    setFilters(DEFAULT_FILTERS);
    setIsDefault(false);
    setAiRationale(null);
    setPoolDepth(null);
  };

  const handleAiPropose = async () => {
    if (!briefText.trim() || briefText.length < 10) {
      showNotification("Please paste a brief with at least 10 characters to propose filters.");
      return;
    }
    setIsProposing(true);
    try {
      const res = await aiProposeIcp(briefText);
      setFilters(res.filters);
      setName(res.suggested_name);
      setAiRationale(res.rationale);
      setPoolDepth(res.estimated_pool_depth);
      showNotification("AI successfully proposed ICP criteria from your brief (Zero API Spend).");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to propose filters";
      showNotification(msg);
    } finally {
      setIsProposing(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (selectedAudienceId) {
        const updated = await updateAudience(selectedAudienceId, {
          name,
          description,
          filters,
          is_default: isDefault,
        });
        setAudiences((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        showNotification(`ICP "${updated.name}" updated successfully.`);
      } else {
        const created = await createAudience({
          name,
          description,
          filters,
          is_default: isDefault,
        });
        setAudiences((prev) => [created, ...prev]);
        setSelectedAudienceId(created.id);
        showNotification(`New ICP "${created.name}" created and saved.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save ICP";
      showNotification(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleVertical = (v: string) => {
    setFilters((prev) => {
      const exists = prev.verticals.includes(v);
      const next = exists ? prev.verticals.filter((item) => item !== v) : [...prev.verticals, v];
      return { ...prev, verticals: next };
    });
  };

  const toggleLocation = (loc: string) => {
    setFilters((prev) => {
      const exists = prev.locations.includes(loc);
      const next = exists ? prev.locations.filter((item) => item !== loc) : [...prev.locations, loc];
      return { ...prev, locations: next };
    });
  };

  const toggleHeadcount = (hc: string) => {
    setFilters((prev) => {
      const exists = prev.headcount_ranges.includes(hc);
      const next = exists ? prev.headcount_ranges.filter((item) => item !== hc) : [...prev.headcount_ranges, hc];
      return { ...prev, headcount_ranges: next };
    });
  };

  const addNegativeKeyword = () => {
    if (!customKeyword.trim()) return;
    setFilters((prev) => ({
      ...prev,
      negative_keywords: [...new Set([...prev.negative_keywords, customKeyword.trim().toLowerCase()])],
    }));
    setCustomKeyword("");
  };

  const removeNegativeKeyword = (kw: string) => {
    setFilters((prev) => ({
      ...prev,
      negative_keywords: prev.negative_keywords.filter((k) => k !== kw),
    }));
  };

  const verticalsList = catalog?.verticals || [
    "B2B SaaS & Enterprise Software",
    "Healthcare & Medical Devices",
    "E-Commerce & Digital Brands",
    "Professional & IT Services",
    "Financial Services & FinTech",
    "Commercial Real Estate & PropTech",
    "Advanced Manufacturing & Logistics",
    "Legal & Regulatory Compliance",
  ];

  const locationsList = catalog?.locations || [
    "United States (Nationwide)",
    "Canada (All Provinces)",
    "United Kingdom (UK)",
    "San Francisco Bay Area, CA",
    "New York Metro, NY",
    "Austin, TX",
    "Chicago, IL",
    "Boston, MA",
    "London, UK",
  ];

  const headcountList = catalog?.headcount_ranges || [
    "1-10 employees",
    "11-50 employees",
    "51-200 employees",
    "201-500 employees",
    "501-1,000 employees",
    "1,000+ enterprise",
  ];

  return (
    <div className="space-y-8">
      {/* Floating Toast Notification */}
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

      {/* Header Banner */}
      <div className="glass-panel rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                Ideal Customer Profile (ICP) & Audiences
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-obsidian-700">
                Org Admin Control
              </span>
            </div>
            <p className="text-obsidian/70 dark:text-cosmic-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Define target verticals, geographic clusters, headcount tiers, and HubSpot exclusions to steer qualification runs.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleCreateNew}
              className="text-xs font-semibold px-4 py-2 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 transition"
            >
              + New ICP Profile
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="btn-obsidian px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                  Saving ICP...
                </>
              ) : (
                <>Save & Activate ICP</>
              )}
            </button>
          </div>
        </div>

        {/* Saved Audiences Selector Bar */}
        {audiences.length > 0 && (
          <div className="mt-5 pt-4 border-t border-cosmic-200 dark:border-obsidian-800 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-obsidian/50 dark:text-cosmic-400 font-bold mr-2">
              Saved Audiences:
            </span>
            {audiences.map((aud) => (
              <button
                key={aud.id}
                type="button"
                onClick={() => handleSelectAudience(aud)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  selectedAudienceId === aud.id
                    ? "btn-obsidian"
                    : "bg-cosmic-100 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-200 dark:border-obsidian-700 hover:bg-cosmic-200 dark:hover:bg-obsidian-700"
                }`}
              >
                <span>{aud.name}</span>
                {aud.is_default && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-bold">
                    DEFAULT
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 1: AI-Powered Suggestion Engine (Section 8.2) */}
      <div className="glass-panel rounded-3xl p-6 border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base text-lilac-600 dark:text-lilac-400">✦</span>
              <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                AI Suggestion Engine (Extract ICP from Client Brief)
              </h3>
            </div>
            <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
              Paste a client strategy brief or document text. LeadFlow extracts target parameters without making paid discovery calls.
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-obsidian-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-obsidian-700 font-bold">
            Zero API Cost
          </span>
        </div>

        <div className="space-y-3">
          <textarea
            rows={3}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            placeholder="e.g. 'Targeting high-growth B2B SaaS and IT consulting companies in Austin and SF Bay Area with 20 to 150 employees. Exclude crypto, gambling, and existing HubSpot accounts.'"
            className="w-full text-xs p-3.5 rounded-2xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 font-sans"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-obsidian/50 dark:text-cosmic-400">
              AI proposes filters; human strategist approves and fine-tunes before save.
            </span>
            <button
              type="button"
              disabled={isProposing}
              onClick={handleAiPropose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-cosmic-200 dark:bg-obsidian-800 hover:bg-cosmic-300 dark:hover:bg-obsidian-700 text-obsidian dark:text-cosmic-100 border border-cosmic-300 dark:border-obsidian-700 transition flex items-center gap-2"
            >
              {isProposing ? (
                <>
                  <span className="animate-spin h-3 w-3 border-2 border-obsidian dark:border-white border-t-transparent rounded-full"></span>
                  Analyzing Brief...
                </>
              ) : (
                <>⚡ Propose ICP Filters</>
              )}
            </button>
          </div>

          {aiRationale && (
            <div className="p-4 rounded-2xl bg-lilac-50/70 dark:bg-obsidian-800/80 border border-lilac-200 dark:border-obsidian-700 text-xs space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-bold text-obsidian dark:text-cosmic-100 text-xs">AI Extraction Rationale</span>
                {poolDepth && (
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-obsidian-900 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    Depth: {poolDepth}
                  </span>
                )}
              </div>
              <p className="text-obsidian/80 dark:text-cosmic-300 leading-relaxed">{aiRationale}</p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: Profile Metadata */}
      <div className="glass-panel rounded-3xl p-6 border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90 space-y-4">
        <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
          ICP Profile Identification
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-obsidian dark:text-cosmic-200 mb-1">Profile Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-obsidian dark:text-cosmic-200 mb-1">Description / Campaign Purpose</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <input
            type="checkbox"
            id="default-icp-checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="w-4 h-4 rounded text-obsidian focus:ring-lilac-400"
          />
          <label htmlFor="default-icp-checkbox" className="text-xs text-obsidian/80 dark:text-cosmic-300 cursor-pointer">
            Set as default ICP for all automated 22-signal qualification runs in this organization
          </label>
        </div>
      </div>

      {/* SECTION 3: Verticals & Industries (OR vs AND Matching, Section 8.1) */}
      <div className="glass-panel rounded-3xl p-6 border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cosmic-200 dark:border-obsidian-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
              1. Target Verticals & Industries
            </h3>
            <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
              Select key target sectors. Match operator determines whether prospects match ANY (wider pool) or ALL (narrow pool).
            </p>
          </div>

          {/* OR vs AND Match Operator */}
          <div className="flex items-center space-x-1.5 bg-cosmic-100 dark:bg-obsidian-800 p-1 rounded-xl border border-cosmic-200 dark:border-obsidian-700 text-xs">
            <button
              type="button"
              onClick={() => setFilters((p) => ({ ...p, vertical_match: "or" }))}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                filters.vertical_match === "or"
                  ? "bg-obsidian text-cosmic-100 dark:bg-obsidian-900 dark:text-cosmic-100"
                  : "text-obsidian/60 dark:text-cosmic-400 hover:text-obsidian"
              }`}
            >
              OR (Wider Pool)
            </button>
            <button
              type="button"
              onClick={() => setFilters((p) => ({ ...p, vertical_match: "and" }))}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                filters.vertical_match === "and"
                  ? "bg-obsidian text-cosmic-100 dark:bg-obsidian-900 dark:text-cosmic-100"
                  : "text-obsidian/60 dark:text-cosmic-400 hover:text-obsidian"
              }`}
            >
              AND (Strict Match)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {verticalsList.map((vert) => {
            const isSelected = filters.verticals.includes(vert);
            return (
              <button
                key={vert}
                type="button"
                onClick={() => toggleVertical(vert)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition border ${
                  isSelected
                    ? "btn-obsidian border-transparent"
                    : "bg-white/80 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-100 dark:hover:bg-obsidian-700"
                }`}
              >
                {isSelected ? "✓ " : "+ "}
                {vert}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Geography & Location (OR vs AND Matching, Section 8.1) */}
      <div className="glass-panel rounded-3xl p-6 border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cosmic-200 dark:border-obsidian-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
              2. Geographic Regions & Cities
            </h3>
            <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
              Target metropolitan hubs or nationwide markets. &quot;OR&quot; expansion includes prospects from any selected market.
            </p>
          </div>

          <div className="flex items-center space-x-1.5 bg-cosmic-100 dark:bg-obsidian-800 p-1 rounded-xl border border-cosmic-200 dark:border-obsidian-700 text-xs">
            <button
              type="button"
              onClick={() => setFilters((p) => ({ ...p, location_match: "or" }))}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                filters.location_match === "or"
                  ? "bg-obsidian text-cosmic-100 dark:bg-obsidian-900 dark:text-cosmic-100"
                  : "text-obsidian/60 dark:text-cosmic-400 hover:text-obsidian"
              }`}
            >
              OR (More Cities)
            </button>
            <button
              type="button"
              onClick={() => setFilters((p) => ({ ...p, location_match: "and" }))}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                filters.location_match === "and"
                  ? "bg-obsidian text-cosmic-100 dark:bg-obsidian-900 dark:text-cosmic-100"
                  : "text-obsidian/60 dark:text-cosmic-400 hover:text-obsidian"
              }`}
            >
              AND (Strict Intersection)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {locationsList.map((loc) => {
            const isSelected = filters.locations.includes(loc);
            return (
              <button
                key={loc}
                type="button"
                onClick={() => toggleLocation(loc)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition border ${
                  isSelected
                    ? "btn-obsidian border-transparent"
                    : "bg-white/80 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-100 dark:hover:bg-obsidian-700"
                }`}
              >
                {isSelected ? "✓ " : "+ "}
                {loc}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 5: Headcount Bounds */}
      <div className="glass-panel rounded-3xl p-6 border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
            3. Organization Headcount / Size Tiers
          </h3>
          <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
            Identify companies with sufficient internal marketing budget and headcount capacity.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-1">
          {headcountList.map((hc) => {
            const isSelected = filters.headcount_ranges.includes(hc);
            return (
              <button
                key={hc}
                type="button"
                onClick={() => toggleHeadcount(hc)}
                className={`p-3 rounded-2xl text-xs font-semibold text-center transition border ${
                  isSelected
                    ? "btn-obsidian border-transparent shadow-sm"
                    : "bg-white/80 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-100 dark:hover:bg-obsidian-700"
                }`}
              >
                {hc}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 6: Exclusions & CRM De-duplication (Section 8.1) */}
      <div className="glass-panel rounded-3xl p-6 border border-blush-200/80 dark:border-obsidian-700 dark:bg-obsidian-900/90 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
            4. Exclusions & CRM Hygiene (Safe Spending)
          </h3>
          <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
            Prevent wasting discovery credits on accounts already in your sales pipeline or irrelevant sectors.
          </p>
        </div>

        {/* HubSpot CRM Exclusion Toggle */}
        <div className="p-4 rounded-2xl bg-cosmic-100/90 dark:bg-obsidian-800 border border-cosmic-200 dark:border-obsidian-700 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-obsidian dark:text-cosmic-100">
              Exclude Existing CRM Contacts (HubSpot)
            </div>
            <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">
              Automatically drops prospects already registered as Contacts or Companies in HubSpot CRM.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilters((p) => ({ ...p, exclude_existing_crm: !p.exclude_existing_crm }))}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              filters.exclude_existing_crm ? "bg-obsidian dark:bg-emerald-600" : "bg-cosmic-300 dark:bg-obsidian-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                filters.exclude_existing_crm ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Negative Keywords Tags */}
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-semibold text-obsidian dark:text-cosmic-200">
            Negative / Blocked Keywords (Auto-Disqualify)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customKeyword}
              onChange={(e) => setCustomKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNegativeKeyword();
                }
              }}
              placeholder="Add keyword (e.g. crypto, non-profit, student) and press Enter"
              className="flex-1 text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
            />
            <button
              type="button"
              onClick={addNegativeKeyword}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-cosmic-200 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 border border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-300"
            >
              Add
            </button>
          </div>

          {filters.negative_keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {filters.negative_keywords.map((kw) => (
                <span
                  key={kw}
                  className="px-2.5 py-1 rounded-xl text-xs font-mono bg-rose-50 dark:bg-obsidian-800 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-obsidian-700 flex items-center gap-1.5"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => removeNegativeKeyword(kw)}
                    className="font-bold hover:text-rose-950 dark:hover:text-white"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
