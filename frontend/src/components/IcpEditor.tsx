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

const SEARCHABLE_CITIES = [
  "New York Metro, NY",
  "San Francisco Bay Area, CA",
  "Austin, TX",
  "Boston, MA",
  "Seattle, WA",
  "Chicago, IL",
  "Los Angeles, CA",
  "Denver, CO",
  "Atlanta, GA",
  "Dallas-Fort Worth, TX",
  "Miami Metro, FL",
  "Washington D.C. Metro",
  "San Diego, CA",
  "Salt Lake City, UT",
  "Toronto, Canada",
  "Vancouver, Canada",
  "London, UK",
  "Manchester, UK",
  "Berlin, Germany",
  "Amsterdam, Netherlands",
  "Singapore",
  "Sydney, Australia",
];

export function IcpEditor() {
  const [catalog, setCatalog] = useState<FilterCatalogResponse | null>(null);
  const [audiences, setAudiences] = useState<AudienceItem[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string | null>(null);

  // Top Page Toggle: Create ICP vs View ICP (User Requirement 2)
  const [activeIcpTab, setActiveIcpTab] = useState<"create" | "view">("create");

  // Manual Form visibility: ONLY visible upon clicking "Add Manually" (User Requirement 4)
  const [showManualForm, setShowManualForm] = useState<boolean>(false);

  // Form Fields
  const [name, setName] = useState<string>("Primary Growth ICP");
  const [description, setDescription] = useState<string>("Core ideal customer profile targeting mid-market B2B software and tech-enabled services.");
  const [filters, setFilters] = useState<AudienceFilters>(DEFAULT_FILTERS);
  const [isDefault, setIsDefault] = useState<boolean>(true);

  // AI Extraction State (User Requirement 1)
  const [briefText, setBriefText] = useState<string>("");
  const [isProposing, setIsProposing] = useState<boolean>(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [poolDepth, setPoolDepth] = useState<string | null>(null);

  // City Searchable Dropdown State (User Requirement 4)
  const [citySearchQuery, setCitySearchQuery] = useState<string>("");
  const [showCityDropdown, setShowCityDropdown] = useState<boolean>(false);

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
    setShowManualForm(true);
    setActiveIcpTab("create");
    showNotification(`Loaded ICP Profile: "${aud.name}"`);
  };

  const handleCreateNew = () => {
    setSelectedAudienceId(null);
    setName("New Target ICP Profile");
    setDescription("Custom audience segment configured for automated qualification.");
    setFilters(DEFAULT_FILTERS);
    setIsDefault(false);
    setAiRationale(null);
    setPoolDepth(null);
    setShowManualForm(true);
    setActiveIcpTab("create");
  };

  // User Requirement 1: Generate ICP from strategy brief
  const handleGenerateIcp = async () => {
    if (!briefText.trim() || briefText.length < 10) {
      showNotification("Please paste a client strategy brief or document text to extract target parameters.");
      return;
    }
    setIsProposing(true);
    try {
      const res = await aiProposeIcp(briefText);
      setFilters(res.filters);
      setName(res.suggested_name);
      setAiRationale(res.rationale);
      setPoolDepth(res.estimated_pool_depth);
      setShowManualForm(true); // Reveal parameters automatically for verification
      showNotification("Target parameters extracted successfully from client strategy brief.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to extract ICP parameters";
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
        showNotification(`ICP "${updated.name}" updated and saved successfully.`);
      } else {
        const created = await createAudience({
          name,
          description,
          filters,
          is_default: isDefault,
        });
        setAudiences((prev) => [created, ...prev]);
        setSelectedAudienceId(created.id);
        showNotification(`ICP "${created.name}" created and saved successfully.`);
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
      return {
        ...prev,
        verticals: exists ? prev.verticals.filter((item) => item !== v) : [...prev.verticals, v],
      };
    });
  };

  const toggleLocation = (loc: string) => {
    setFilters((prev) => {
      const exists = prev.locations.includes(loc);
      return {
        ...prev,
        locations: exists ? prev.locations.filter((item) => item !== loc) : [...prev.locations, loc],
      };
    });
  };

  const addCityFromDropdown = (city: string) => {
    if (!filters.locations.includes(city)) {
      setFilters((prev) => ({
        ...prev,
        locations: [...prev.locations, city],
      }));
    }
    setCitySearchQuery("");
    setShowCityDropdown(false);
  };

  const toggleHeadcount = (tier: string) => {
    setFilters((prev) => {
      const exists = prev.headcount_ranges.includes(tier);
      return {
        ...prev,
        headcount_ranges: exists
          ? prev.headcount_ranges.filter((item) => item !== tier)
          : [...prev.headcount_ranges, tier],
      };
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

  const headcountList = catalog?.headcount_ranges || [
    "1-10 employees",
    "11-50 employees",
    "51-200 employees",
    "201-500 employees",
    "501-1,000 employees",
    "1,000+ enterprise",
  ];

  const filteredCities = SEARCHABLE_CITIES.filter((c) =>
    c.toLowerCase().includes(citySearchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
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

      {/* User Requirement 2: Toggle right above ICP card with 2 options: Create ICP | View ICP */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 bg-cosmic-100/90 dark:bg-obsidian-800 p-1.5 rounded-2xl border border-cosmic-300 dark:border-obsidian-700 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveIcpTab("create")}
            className={`px-4 py-2 rounded-xl transition cursor-pointer ${
              activeIcpTab === "create"
                ? "btn-obsidian shadow-sm"
                : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
            }`}
          >
            Create ICP
          </button>
          <button
            type="button"
            onClick={() => setActiveIcpTab("view")}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeIcpTab === "view"
                ? "btn-obsidian shadow-sm"
                : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
            }`}
          >
            <span>View ICP</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-lilac-200 dark:bg-obsidian-700 text-lilac-800 dark:text-cosmic-200">
              {audiences.length}
            </span>
          </button>
        </div>

        {activeIcpTab === "create" && (
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleCreateNew}
              className="text-xs font-semibold px-4 py-2 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 transition"
            >
              + New Profile
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="btn-obsidian px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm cursor-pointer"
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
        )}
      </div>

      {/* VIEW 1: VIEW ICP (User Requirement 2 - View Organization's Saved ICPs) */}
      {activeIcpTab === "view" && (
        <div className="space-y-4">
          <div className="glass-panel card-cosmic rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700">
            <div className="flex items-center justify-between pb-4 border-b border-cosmic-200 dark:border-obsidian-800">
              <div>
                <h2 className="text-xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                  Saved Organization ICP Profiles
                </h2>
                <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                  All active Ideal Customer Profiles configured for your workspace qualification runs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleCreateNew();
                  setActiveIcpTab("create");
                }}
                className="btn-obsidian px-4 py-2 rounded-xl text-xs font-semibold"
              >
                + Create New ICP
              </button>
            </div>

            {audiences.length === 0 ? (
              <div className="py-12 text-center text-obsidian/60 dark:text-cosmic-400 text-xs">
                No ICP profiles configured yet. Click "Create ICP" to set up your target criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                {audiences.map((aud) => (
                  <div
                    key={aud.id}
                    className="card-nested rounded-2xl p-5 border border-cosmic-200 dark:border-obsidian-700 space-y-3.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-obsidian dark:text-cosmic-100 tracking-tight">
                          {aud.name}
                        </h3>
                        {aud.is_default && (
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            Active Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-obsidian/70 dark:text-cosmic-300 mt-1 leading-relaxed">
                        {aud.description || "No description provided."}
                      </p>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] font-mono uppercase font-bold text-obsidian/50 dark:text-cosmic-400 block mb-1">
                          Target Verticals ({aud.filters.verticals.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {aud.filters.verticals.map((v) => (
                            <span
                              key={v}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-cosmic-100/90 dark:bg-obsidian-800 text-obsidian/80 dark:text-cosmic-200 border border-cosmic-200 dark:border-obsidian-700"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono uppercase font-bold text-obsidian/50 dark:text-cosmic-400 block mb-1">
                          Geographies & Metros ({aud.filters.locations.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {aud.filters.locations.map((loc) => (
                            <span
                              key={loc}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-lilac-50 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-obsidian-700"
                            >
                              {loc}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-obsidian/50 dark:text-cosmic-400">
                        {aud.filters.headcount_ranges.join(", ")}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectAudience(aud)}
                        className="btn-obsidian px-3 py-1.5 rounded-xl text-xs font-semibold"
                      >
                        Edit in Builder →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: CREATE ICP (User Requirements 1, 3, 4) */}
      {activeIcpTab === "create" && (
        <div className="space-y-6">
          {/* User Requirement 1 & 3: Merged Ideal Customer Profile (ICP) Card & AI Suggestion Engine */}
          <div className="glass-panel card-cosmic rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <h2 className="text-xl font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                  Ideal Customer Profile (ICP)
                </h2>
                {/* User Requirement 1: Add Manually button right beside heading */}
                <button
                  type="button"
                  onClick={() => setShowManualForm(!showManualForm)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                    showManualForm
                      ? "btn-obsidian shadow-sm"
                      : "bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 border-cosmic-300 dark:border-obsidian-700 hover:bg-cosmic-200"
                  }`}
                >
                  {showManualForm ? "✓ Manual Form Open" : "+ Add Manually"}
                </button>
              </div>

              {/* Zero API cost tag REMOVED per User Requirement 3 */}
            </div>

            {/* Instruction text right below heading */}
            <p className="text-xs text-obsidian/75 dark:text-cosmic-300 font-medium leading-relaxed">
              Paste a client strategy brief or document text. LeadFlow extracts target parameters&gt;
            </p>

            {/* Strategy text box with example placeholder */}
            <div className="space-y-3">
              <textarea
                rows={3}
                value={briefText}
                onChange={(e) => setBriefText(e.target.value)}
                placeholder="e.g. 'Targeting high-growth B2B SaaS and IT consulting companies in Austin and SF Bay Area with 20 to 150 employees. Exclude crypto, gambling, and existing HubSpot accounts.'"
                className="w-full text-xs p-3.5 rounded-2xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 font-sans leading-relaxed"
              />

              {/* Button on lower right: Generate ICP (User Requirement 1) */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-obsidian/50 dark:text-cosmic-400">
                  LeadFlow parses verticals, locations, employee ranges, and negative exclusions.
                </span>
                <button
                  type="button"
                  disabled={isProposing}
                  onClick={handleGenerateIcp}
                  className="btn-obsidian px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  {isProposing ? (
                    <>
                      <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                      Extracting Parameters...
                    </>
                  ) : (
                    <>⚡ Generate ICP</>
                  )}
                </button>
              </div>

              {aiRationale && (
                <div className="card-nested p-4 rounded-2xl text-xs space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-obsidian dark:text-cosmic-100 text-xs">Extracted Parameters Overview</span>
                    {poolDepth && (
                      <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-obsidian-900 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        Estimated Pool: {poolDepth}
                      </span>
                    )}
                  </div>
                  <p className="text-obsidian/80 dark:text-cosmic-300 leading-relaxed">{aiRationale}</p>
                </div>
              )}
            </div>
          </div>

          {/* User Requirement 4: ONLY upon clicking "Add Manually" button show the below cards as a grouped form */}
          {showManualForm && (
            <div className="glass-panel card-cosmic rounded-3xl p-7 border border-blush-200/80 dark:border-obsidian-700 space-y-7 animate-in fade-in slide-in-from-top-3 duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-cosmic-200 dark:border-obsidian-800">
                <h3 className="text-base font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                  Manual ICP Criteria Configuration
                </h3>
                <span className="text-[11px] font-mono text-obsidian/50 dark:text-cosmic-400">
                  Interactive Form & Filter Catalog
                </span>
              </div>

              {/* 1. Profile Metadata */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-obsidian dark:text-cosmic-200 mb-1">
                      ICP Profile Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-obsidian dark:text-cosmic-200 mb-1">
                      Campaign Purpose / Strategy Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="default-icp-checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-obsidian focus:ring-lilac-400 cursor-pointer"
                  />
                  <label htmlFor="default-icp-checkbox" className="text-xs text-obsidian/80 dark:text-cosmic-300 cursor-pointer">
                    Set as default active ICP for automated 22-signal qualification runs in this workspace
                  </label>
                </div>
              </div>

              {/* 2. Verticals & Industries */}
              <div className="space-y-3 pt-3 border-t border-cosmic-200 dark:border-obsidian-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                      Target Industry Verticals
                    </h4>
                    <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400">
                      Match any selected industry (OR) or require all to be present (AND).
                    </p>
                  </div>
                  <div className="flex items-center space-x-1 bg-cosmic-100 dark:bg-obsidian-800 p-1 rounded-xl border border-cosmic-300 dark:border-obsidian-700 text-[10px] font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => setFilters((p) => ({ ...p, vertical_match: "or" }))}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        filters.vertical_match === "or" ? "btn-obsidian" : "text-obsidian/60 dark:text-cosmic-400"
                      }`}
                    >
                      MATCH ANY (OR)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilters((p) => ({ ...p, vertical_match: "and" }))}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        filters.vertical_match === "and" ? "btn-obsidian" : "text-obsidian/60 dark:text-cosmic-400"
                      }`}
                    >
                      MATCH ALL (AND)
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {verticalsList.map((v) => {
                    const isSelected = filters.verticals.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleVertical(v)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                          isSelected
                            ? "btn-obsidian"
                            : "bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border-cosmic-200 dark:border-obsidian-700 hover:bg-cosmic-100"
                        }`}
                      >
                        <span>{v}</span>
                        {isSelected && <span className="text-emerald-400 font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Geographic Locations & Cities with Searchable Dropdown (User Requirement 4) */}
              <div className="space-y-3 pt-3 border-t border-cosmic-200 dark:border-obsidian-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                      Geographic Locations & Cities (Searchable Dropdown)
                    </h4>
                    <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400">
                      Type to filter verified city and metro names without typographical errors.
                    </p>
                  </div>
                </div>

                {/* Searchable Dropdown Input */}
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={citySearchQuery}
                        onChange={(e) => {
                          setCitySearchQuery(e.target.value);
                          setShowCityDropdown(true);
                        }}
                        onFocus={() => setShowCityDropdown(true)}
                        placeholder="Search city, metro, or country (e.g. Austin, New York, London)..."
                        className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                      />
                      {citySearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setCitySearchQuery("");
                            setShowCityDropdown(false);
                          }}
                          className="absolute right-3 top-3 text-xs text-obsidian/40 dark:text-cosmic-400 hover:text-obsidian"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filtered Dropdown Menu */}
                  {showCityDropdown && (
                    <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-obsidian-900 border border-cosmic-300 dark:border-obsidian-700 rounded-2xl shadow-xl z-20 py-1 text-xs">
                      {filteredCities.length === 0 ? (
                        <div className="p-3 text-obsidian/50 dark:text-cosmic-400 text-center">
                          No matching verified cities found.
                        </div>
                      ) : (
                        filteredCities.map((city) => (
                          <button
                            key={city}
                            type="button"
                            onClick={() => addCityFromDropdown(city)}
                            className="w-full text-left px-3.5 py-2 hover:bg-lilac-50 dark:hover:bg-obsidian-800 flex items-center justify-between text-obsidian dark:text-cosmic-200 transition"
                          >
                            <span>{city}</span>
                            {filters.locations.includes(city) && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                Added ✓
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Locations Chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {filters.locations.map((loc) => (
                    <span
                      key={loc}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 border border-cosmic-300 dark:border-obsidian-700 flex items-center gap-2"
                    >
                      <span>{loc}</span>
                      <button
                        type="button"
                        onClick={() => toggleLocation(loc)}
                        className="text-obsidian/50 hover:text-rose-600 dark:text-cosmic-400 dark:hover:text-rose-400 font-bold"
                        title="Remove location"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* 4. Company Headcount Tiers */}
              <div className="space-y-3 pt-3 border-t border-cosmic-200 dark:border-obsidian-800">
                <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                  Target Company Headcount (Employee Ranges)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {headcountList.map((tier) => {
                    const isSelected = filters.headcount_ranges.includes(tier);
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => toggleHeadcount(tier)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                          isSelected
                            ? "btn-obsidian"
                            : "bg-cosmic-50/90 dark:bg-obsidian-800 text-obsidian/70 dark:text-cosmic-300 border-cosmic-200 dark:border-obsidian-700 hover:bg-cosmic-100"
                        }`}
                      >
                        <span>{tier}</span>
                        {isSelected && <span className="text-emerald-400 font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Exclusions & Negative Keywords */}
              <div className="space-y-3 pt-3 border-t border-cosmic-200 dark:border-obsidian-800">
                <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                  Negative Exclusions & CRM Suppression
                </h4>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="crm-suppress-checkbox"
                    checked={filters.exclude_existing_crm}
                    onChange={(e) => setFilters((p) => ({ ...p, exclude_existing_crm: e.target.checked }))}
                    className="w-4 h-4 rounded text-obsidian focus:ring-lilac-400 cursor-pointer"
                  />
                  <label htmlFor="crm-suppress-checkbox" className="text-xs text-obsidian/80 dark:text-cosmic-300 cursor-pointer">
                    Automatically suppress and skip any prospect already synced to HubSpot CRM
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-1">
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
                    placeholder="Add negative exclusion keyword (e.g. crypto, agency, nonprofit)..."
                    className="flex-1 text-xs p-2.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                  />
                  <button
                    type="button"
                    onClick={addNegativeKeyword}
                    className="btn-obsidian px-4 py-2.5 rounded-xl text-xs font-semibold"
                  >
                    + Exclude
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {filters.negative_keywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-2.5 py-1 rounded-xl text-xs font-mono font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 flex items-center gap-1.5"
                    >
                      <span>✕ {kw}</span>
                      <button
                        type="button"
                        onClick={() => removeNegativeKeyword(kw)}
                        className="text-rose-600 hover:text-rose-900 dark:hover:text-white font-bold ml-1"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Footer */}
              <div className="pt-4 border-t border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
                <span className="text-xs text-obsidian/50 dark:text-cosmic-400">
                  Ready to activate for qualification batch runs.
                </span>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSave}
                  className="btn-obsidian px-6 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  {isSaving ? "Saving ICP..." : "Save & Activate ICP"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
