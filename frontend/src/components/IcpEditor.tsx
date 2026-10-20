"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AudienceItem,
  AudienceFilters,
  FilterCatalogResponse,
  fetchFilterCatalog,
  fetchAudiences,
  createAudience,
  updateAudience,
  aiProposeIcp,
  discoverCompaniesForIcp,
  moveCompanyToPipeline,
  DiscoveredCompany,
} from "@/lib/api";
import { useNav } from "@/lib/nav-context";

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

export function normalizeAudienceFilters(rawFilters: any): AudienceFilters {
  let parsed = rawFilters;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  if (!parsed || typeof parsed !== "object") {
    parsed = {};
  }
  return {
    verticals: Array.isArray(parsed.verticals) ? parsed.verticals : [],
    vertical_match: parsed.vertical_match === "and" ? "and" : "or",
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    location_match: parsed.location_match === "and" ? "and" : "or",
    headcount_ranges: Array.isArray(parsed.headcount_ranges) ? parsed.headcount_ranges : [],
    exclude_locations: Array.isArray(parsed.exclude_locations) ? parsed.exclude_locations : [],
    exclude_verticals: Array.isArray(parsed.exclude_verticals) ? parsed.exclude_verticals : [],
    exclude_domains: Array.isArray(parsed.exclude_domains) ? parsed.exclude_domains : [],
    exclude_existing_crm: typeof parsed.exclude_existing_crm === "boolean" ? parsed.exclude_existing_crm : true,
    negative_keywords: Array.isArray(parsed.negative_keywords) ? parsed.negative_keywords : [],
  };
}

export const HUNTER_INDUSTRIES: string[] = [
  "Information Technology & Services",
  "Computer Software",
  "Internet",
  "Marketing & Advertising",
  "Financial Services",
  "Management Consulting",
  "Telecommunications",
  "Hospital & Health Care",
  "Construction",
  "Real Estate",
  "Retail",
  "Education Management",
  "Non-Profit Organization Management",
  "Higher Education",
  "Design",
  "E-Commerce",
  "Banking",
  "Hospitality",
  "Insurance",
  "Human Resources",
  "Legal Services",
  "Automotive",
  "Manufacturing",
  "Consumer Goods",
  "Media Production",
  "Pharmaceuticals",
  "Accounting",
  "Staffing & Recruiting",
  "Electrical/Electronic Manufacturing",
  "Entertainment",
  "Transportation/Trucking/Railroad",
  "Biotechnology",
  "Wholesale",
  "Food & Beverages",
  "Logistics & Supply Chain",
  "Computer Hardware",
  "Public Relations & Communications",
  "Health, Wellness & Fitness",
  "Civil Engineering",
  "Architecture & Planning",
  "Defense & Space",
  "Mechanical or Industrial Engineering",
  "Environmental Services",
  "Apparel & Fashion",
  "Publishing",
  "Medical Devices",
  "Venture Capital & Private Equity",
  "Chemicals",
  "Renewable Energy & Environment",
  "Aviation & Aerospace",
  "Graphic Design",
  "Government Administration",
  "Research",
  "Security & Investigations",
  "Oil & Energy",
  "Semiconductors",
  "Consumer Electronics",
  "Computer Networking",
  "Information Services",
];

export const HUNTER_LOCATIONS: string[] = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "India",
  "Netherlands",
  "Singapore",
  "Spain",
  "Italy",
  "Sweden",
  "Switzerland",
  "Ireland",
  "Israel",
  "Brazil",
  "Japan",
  "United Arab Emirates",
  "New Zealand",
  "Belgium",
  "Denmark",
  "Norway",
  "Finland",
  "Poland",
  "Austria",
  "Mexico",
  "South Africa",
  "Portugal",
  "Hong Kong",
  "New York Metro, NY, United States",
  "San Francisco Bay Area, CA, United States",
  "Austin, TX, United States",
  "Boston, MA, United States",
  "Seattle, WA, United States",
  "Chicago, IL, United States",
  "Los Angeles, CA, United States",
  "Denver, CO, United States",
  "Atlanta, GA, United States",
  "Dallas-Fort Worth, TX, United States",
  "Miami, FL, United States",
  "Washington, D.C., United States",
  "London, United Kingdom",
  "Manchester, United Kingdom",
  "Toronto, Canada",
  "Vancouver, Canada",
  "Montreal, Canada",
  "Berlin, Germany",
  "Munich, Germany",
  "Paris, France",
  "Amsterdam, Netherlands",
  "Sydney, Australia",
  "Melbourne, Australia",
  "Bengaluru, India",
  "Mumbai, India",
  "Delhi NCR, India",
  "Tel Aviv, Israel",
  "Tokyo, Japan",
  "Dubai, United Arab Emirates",
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

  // Hunter.io Industry & Geographic Searchable Dropdown State (User Requirements 2 & 3)
  const [industrySearchQuery, setIndustrySearchQuery] = useState<string>("");
  const [showIndustryDropdown, setShowIndustryDropdown] = useState<boolean>(false);
  const [geoSearchQuery, setGeoSearchQuery] = useState<string>("");
  const [showGeoDropdown, setShowGeoDropdown] = useState<boolean>(false);

  // Container refs for detecting click outside (User Requirement 3)
  const industryContainerRef = useRef<HTMLDivElement>(null);
  const geoContainerRef = useRef<HTMLDivElement>(null);

  // Close industry and geographic dropdowns if clicking anywhere outside (User Requirement 3)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        industryContainerRef.current &&
        !industryContainerRef.current.contains(event.target as Node)
      ) {
        setShowIndustryDropdown(false);
      }
      if (
        geoContainerRef.current &&
        !geoContainerRef.current.contains(event.target as Node)
      ) {
        setShowGeoDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // UI state
  const { setActiveTab } = useNav();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [customKeyword, setCustomKeyword] = useState<string>("");

  // Hunter.io Live Discovery State & Fetch Constraint
  const [fetchLimit, setFetchLimit] = useState<number>(5);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [discoveredCompanies, setDiscoveredCompanies] = useState<DiscoveredCompany[]>([]);
  const [movedCompanyDomains, setMovedCompanyDomains] = useState<Set<string>>(new Set());
  const [movingDomain, setMovingDomain] = useState<string | null>(null);

  const DRAFT_KEY = "leadflow_draft_icp";

  // Auto-save half-filled ICP details to localStorage (User Requirement 5)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasData =
      name.trim() !== "" ||
      description.trim() !== "" ||
      briefText.trim() !== "" ||
      filters.verticals.length > 0 ||
      filters.locations.length > 0;
    if (hasData) {
      try {
        const draft = {
          name,
          description,
          filters,
          briefText,
          isDefault,
          showManualForm,
          selectedAudienceId,
          timestamp: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // ignore quota / private window errors
      }
    }
  }, [name, description, filters, briefText, isDefault, showManualForm, selectedAudienceId]);

  useEffect(() => {
    async function loadData() {
      try {
        const [catData, audData] = await Promise.all([
          fetchFilterCatalog().catch(() => null),
          fetchAudiences().catch(() => []),
        ]);
        if (catData) setCatalog(catData);
        if (audData && audData.length > 0) {
          const sanitized = audData.map((a) => ({
            ...a,
            filters: normalizeAudienceFilters(a.filters),
          }));
          setAudiences(sanitized);
        }

        // Restore half-filled draft from localStorage if available (User Requirement 5)
        let restoredFromDraft = false;
        if (typeof window !== "undefined") {
          try {
            const rawDraft = localStorage.getItem(DRAFT_KEY);
            if (rawDraft) {
              const draft = JSON.parse(rawDraft);
              if (draft && typeof draft === "object") {
                if (draft.name !== undefined) setName(draft.name);
                if (draft.description !== undefined) setDescription(draft.description);
                if (draft.filters) setFilters(normalizeAudienceFilters(draft.filters));
                if (draft.briefText !== undefined) setBriefText(draft.briefText);
                if (draft.isDefault !== undefined) setIsDefault(draft.isDefault);
                if (draft.showManualForm !== undefined) setShowManualForm(draft.showManualForm);
                if (draft.selectedAudienceId) setSelectedAudienceId(draft.selectedAudienceId);
                restoredFromDraft = true;
              }
            }
          } catch (e) {
            console.warn("Failed to restore draft:", e);
          }
        }

        // Only default to first audience if no draft was restored
        if (!restoredFromDraft && audData && audData.length > 0) {
          const active = audData.find((a) => a.is_default) || audData[0];
          setSelectedAudienceId(active.id);
          setName(active.name);
          setDescription(active.description || "");
          setFilters(normalizeAudienceFilters(active.filters));
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
    setFilters(normalizeAudienceFilters(aud.filters));
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
    setBriefText("");
    setAiRationale(null);
    setPoolDepth(null);
    setShowManualForm(true);
    setActiveIcpTab("create");
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
  };

  // User Requirement 1 & 5: Clear ICP profile and prompt, and remove local storage draft
  const handleClearProfileAndPrompt = () => {
    setSelectedAudienceId(null);
    setName("");
    setDescription("");
    setBriefText("");
    setFilters({
      verticals: [],
      vertical_match: "or",
      locations: [],
      location_match: "or",
      headcount_ranges: [],
      exclude_locations: [],
      exclude_verticals: [],
      exclude_domains: [],
      exclude_existing_crm: true,
      negative_keywords: [],
    });
    setAiRationale(null);
    setPoolDepth(null);
    setCustomKeyword("");
    setIndustrySearchQuery("");
    setShowIndustryDropdown(false);
    setGeoSearchQuery("");
    setShowGeoDropdown(false);
    setDiscoveredCompanies([]);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
    showNotification("Cleared ICP profile fields, filters, and strategy prompt.");
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
      setFilters(normalizeAudienceFilters(res.filters));
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
        const safeUpdated = {
          ...updated,
          filters: normalizeAudienceFilters(updated.filters),
        };
        setAudiences((prev) => prev.map((a) => (a.id === safeUpdated.id ? safeUpdated : a)));
        showNotification(`ICP "${safeUpdated.name}" updated and saved successfully.`);
      } else {
        const created = await createAudience({
          name,
          description,
          filters,
          is_default: isDefault,
        });
        const safeCreated = {
          ...created,
          filters: normalizeAudienceFilters(created.filters),
        };
        setAudiences((prev) => [safeCreated, ...prev]);
        setSelectedAudienceId(safeCreated.id);
        showNotification(`ICP "${safeCreated.name}" created and saved successfully.`);
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {}
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save ICP";
      showNotification(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscoverCompanies = async () => {
    setIsDiscovering(true);
    try {
      const constrainedLimit = Math.max(1, Math.min(fetchLimit, 25));
      const res = await discoverCompaniesForIcp({
        filters,
        limit: constrainedLimit,
      });
      setDiscoveredCompanies(res.companies);
      showNotification(`Discovered ${res.companies.length} companies matching your ICP criteria.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch companies from Hunter.io";
      showNotification(msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleMoveToReview = async (company: DiscoveredCompany) => {
    setMovingDomain(company.domain);
    try {
      await moveCompanyToPipeline({
        company_name: company.company_name,
        domain: company.domain,
        industry: company.industry,
        location: company.location,
        employee_count: company.employee_count,
        contact_email: company.sample_email,
        contact_name: "Executive Leader",
        pipeline_state: "review",
      });
      setMovedCompanyDomains((prev) => new Set(prev).add(company.domain));
      showNotification(`✓ Moved "${company.company_name}" to Review in Lead Pipeline!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to move company to pipeline";
      showNotification(msg);
    } finally {
      setMovingDomain(null);
    }
  };

  const addIndustryFromDropdown = (ind: string) => {
    if (!filters.verticals.includes(ind)) {
      setFilters((prev) => ({
        ...prev,
        verticals: [...prev.verticals, ind],
      }));
    }
    setIndustrySearchQuery("");
    setShowIndustryDropdown(false);
  };

  const removeIndustry = (ind: string) => {
    setFilters((prev) => ({
      ...prev,
      verticals: prev.verticals.filter((item) => item !== ind),
    }));
  };

  const addLocationFromDropdown = (loc: string) => {
    if (!filters.locations.includes(loc)) {
      setFilters((prev) => ({
        ...prev,
        locations: [...prev.locations, loc],
      }));
    }
    setGeoSearchQuery("");
    setShowGeoDropdown(false);
  };

  const removeLocation = (loc: string) => {
    setFilters((prev) => ({
      ...prev,
      locations: prev.locations.filter((item) => item !== loc),
    }));
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

  const filteredIndustries = HUNTER_INDUSTRIES.filter((ind) =>
    ind.toLowerCase().includes(industrySearchQuery.toLowerCase())
  );

  const filteredLocations = HUNTER_LOCATIONS.filter((loc) =>
    loc.toLowerCase().includes(geoSearchQuery.toLowerCase())
  );

  const headcountList = catalog?.headcount_ranges || [
    "1-10 employees",
    "11-50 employees",
    "51-200 employees",
    "201-500 employees",
    "501-1,000 employees",
    "1,000+ enterprise",
  ];

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
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={handleClearProfileAndPrompt}
              className="text-xs font-semibold px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/90 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Clear all fields, filters, strategy prompt, and local draft"
            >
              <span>✕</span>
              <span>Clear Profile & Prompt</span>
            </button>
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
                {audiences.map((aud) => {
                  const audFilters = normalizeAudienceFilters(aud.filters);
                  return (
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
                            Target Verticals ({audFilters.verticals.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {audFilters.verticals.map((v) => (
                              <span
                                key={v}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-cosmic-100/90 dark:bg-obsidian-800 text-obsidian/80 dark:text-cosmic-200 border border-cosmic-200 dark:border-obsidian-700"
                              >
                                {v}
                              </span>
                            ))}
                            {audFilters.verticals.length === 0 && (
                              <span className="text-[10px] text-obsidian/40 dark:text-cosmic-400 italic">All industries</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-mono uppercase font-bold text-obsidian/50 dark:text-cosmic-400 block mb-1">
                            Geographies & Metros ({audFilters.locations.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {audFilters.locations.map((loc) => (
                              <span
                                key={loc}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-lilac-50 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 border border-lilac-200 dark:border-obsidian-700"
                              >
                                {loc}
                              </span>
                            ))}
                            {audFilters.locations.length === 0 && (
                              <span className="text-[10px] text-obsidian/40 dark:text-cosmic-400 italic">All geographies</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-cosmic-200 dark:border-obsidian-800 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-obsidian/50 dark:text-cosmic-400">
                          {audFilters.headcount_ranges.length > 0 ? audFilters.headcount_ranges.join(", ") : "All company sizes"}
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
                  );
                })}
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
                {/* Collapsible toggle button right beside heading */}
                <button
                  type="button"
                  onClick={() => setShowManualForm(!showManualForm)}
                  className="btn-obsidian px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Add manually"
                >
                  <span>+ Add Manually</span>
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
                <div className="flex items-center gap-2">
                  {(briefText || aiRationale) && (
                    <button
                      type="button"
                      onClick={() => {
                        setBriefText("");
                        setAiRationale(null);
                        setPoolDepth(null);
                        showNotification("Strategy prompt and extracted summary cleared.");
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer"
                    >
                      Clear Prompt
                    </button>
                  )}
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

          {/* User Requirement 4: Collapsible manual configuration form */}
          {showManualForm && (
            <div className="glass-panel card-cosmic rounded-3xl p-7 border border-blush-200/80 dark:border-obsidian-700 space-y-7 animate-in fade-in slide-in-from-top-3 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-cosmic-200 dark:border-obsidian-800 gap-3">
                <div className="flex items-center gap-2.5">
                  <div>
                    <h3 className="text-base font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                      Manual ICP Criteria Configuration
                    </h3>
                    <span className="text-[11px] font-mono text-obsidian/50 dark:text-cosmic-400">
                      Interactive Form & Filter Catalog
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearProfileAndPrompt}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>✕</span>
                    <span>Clear All Fields</span>
                  </button>
                </div>
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

              {/* 2. Verticals & Industries (User Requirements 2 & 4: Exact Hunter.io Searchable Dropdown & Match Any/All Removed) */}
              <div className="space-y-3 pt-3 border-t border-cosmic-200 dark:border-obsidian-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                      Target Industry Verticals (Hunter.io Classification)
                    </h4>
                    <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400">
                      Search and select from 58 standardized Hunter.io industry sectors.
                    </p>
                  </div>
                  {(filters?.verticals || []).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilters((p) => ({ ...p, verticals: [] }))}
                      className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear Industries ({(filters?.verticals || []).length})
                    </button>
                  )}
                </div>

                {/* Searchable Industry Dropdown */}
                <div ref={industryContainerRef} className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      value={industrySearchQuery}
                      onChange={(e) => {
                        setIndustrySearchQuery(e.target.value);
                        setShowIndustryDropdown(true);
                      }}
                      onFocus={() => setShowIndustryDropdown(true)}
                      placeholder="Search industry (e.g. Computer Software, Marketing & Advertising, Financial Services)..."
                      className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                    />
                    {industrySearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setIndustrySearchQuery("");
                          setShowIndustryDropdown(false);
                        }}
                        className="absolute right-3 top-3 text-xs text-obsidian/40 dark:text-cosmic-400 hover:text-obsidian"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {showIndustryDropdown && (
                    <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white dark:bg-obsidian-900 border border-cosmic-300 dark:border-obsidian-700 rounded-2xl shadow-xl z-20 py-1 text-xs">
                      {filteredIndustries.length === 0 ? (
                        <div className="p-3 text-obsidian/50 dark:text-cosmic-400 text-center">
                          No matching Hunter.io industries found.
                        </div>
                      ) : (
                        filteredIndustries.map((ind) => {
                          const isAdded = (filters?.verticals || []).includes(ind);
                          return (
                            <button
                              key={ind}
                              type="button"
                              onClick={() => addIndustryFromDropdown(ind)}
                              className="w-full text-left px-3.5 py-2 hover:bg-lilac-50 dark:hover:bg-obsidian-800 flex items-center justify-between text-obsidian dark:text-cosmic-200 transition cursor-pointer"
                            >
                              <span>{ind}</span>
                              {isAdded && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                  Added ✓
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Industry Chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(filters?.verticals || []).map((v) => (
                    <span
                      key={v}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 border border-cosmic-300 dark:border-obsidian-700 flex items-center gap-2"
                    >
                      <span>{v}</span>
                      <button
                        type="button"
                        onClick={() => removeIndustry(v)}
                        className="text-obsidian/50 hover:text-rose-600 dark:text-cosmic-400 dark:hover:text-rose-400 font-bold cursor-pointer"
                        title="Remove industry"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {(filters?.verticals || []).length === 0 && (
                    <span className="text-xs text-obsidian/40 dark:text-cosmic-400 italic">
                      No industries selected yet. Search above to add target sectors.
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Geographic Locations & Countries (User Requirement 3: Exact Hunter.io Searchable Dropdown) */}
              <div className="space-y-3 pt-3 border-t border-cosmic-200 dark:border-obsidian-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                      Geographic Locations & Countries (Hunter.io Classification)
                    </h4>
                    <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400">
                      Search and select countries and major metropolitan hubs supported by Hunter.io.
                    </p>
                  </div>
                  {(filters?.locations || []).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilters((p) => ({ ...p, locations: [] }))}
                      className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear Locations ({(filters?.locations || []).length})
                    </button>
                  )}
                </div>

                {/* Searchable Dropdown Input */}
                <div ref={geoContainerRef} className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      value={geoSearchQuery}
                      onChange={(e) => {
                        setGeoSearchQuery(e.target.value);
                        setShowGeoDropdown(true);
                      }}
                      onFocus={() => setShowGeoDropdown(true)}
                      placeholder="Search country or metro (e.g. United States, United Kingdom, Canada, Berlin, Austin)..."
                      className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                    />
                    {geoSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setGeoSearchQuery("");
                          setShowGeoDropdown(false);
                        }}
                        className="absolute right-3 top-3 text-xs text-obsidian/40 dark:text-cosmic-400 hover:text-obsidian"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Filtered Dropdown Menu */}
                  {showGeoDropdown && (
                    <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white dark:bg-obsidian-900 border border-cosmic-300 dark:border-obsidian-700 rounded-2xl shadow-xl z-20 py-1 text-xs">
                      {filteredLocations.length === 0 ? (
                        <div className="p-3 text-obsidian/50 dark:text-cosmic-400 text-center">
                          No matching Hunter.io locations found.
                        </div>
                      ) : (
                        filteredLocations.map((loc) => {
                          const isAdded = (filters?.locations || []).includes(loc);
                          return (
                            <button
                              key={loc}
                              type="button"
                              onClick={() => addLocationFromDropdown(loc)}
                              className="w-full text-left px-3.5 py-2 hover:bg-lilac-50 dark:hover:bg-obsidian-800 flex items-center justify-between text-obsidian dark:text-cosmic-200 transition cursor-pointer"
                            >
                              <span>{loc}</span>
                              {isAdded && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                  Added ✓
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Locations Chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(filters?.locations || []).map((loc) => (
                    <span
                      key={loc}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cosmic-100 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 border border-cosmic-300 dark:border-obsidian-700 flex items-center gap-2"
                    >
                      <span>{loc}</span>
                      <button
                        type="button"
                        onClick={() => removeLocation(loc)}
                        className="text-obsidian/50 hover:text-rose-600 dark:text-cosmic-400 dark:hover:text-rose-400 font-bold cursor-pointer"
                        title="Remove location"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {(filters?.locations || []).length === 0 && (
                    <span className="text-xs text-obsidian/40 dark:text-cosmic-400 italic">
                      No locations selected yet. Search above to add target regions.
                    </span>
                  )}
                </div>
              </div>

              {/* 4. Company Headcount Tiers */}
              <div className="space-y-3 pt-3 border-t border-cosmic-200 dark:border-obsidian-800">
                <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight">
                  Target Company Headcount (Employee Ranges)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {headcountList.map((tier) => {
                    const isSelected = (filters?.headcount_ranges || []).includes(tier);
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
                  {(filters?.negative_keywords || []).map((kw) => (
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

              {/* Target Company Discovery & Live Sourcing (Hunter.io) */}
              <div className="pt-6 border-t border-cosmic-200 dark:border-obsidian-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <h4 className="text-sm font-bold text-obsidian dark:text-cosmic-100">
                        Target Company Discovery & Sourcing (Hunter.io)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        Live Filter API
                      </span>
                    </div>
                    <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mt-1">
                      Query Hunter.io Discover with active filters ({filters?.verticals?.[0] || "All"} &bull; {filters?.locations?.[0] || "All"} &bull; {filters?.headcount_ranges?.[0] || "All"}).
                    </p>
                  </div>

                  {/* Limit constraint input & fetch trigger */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-cosmic-100 dark:bg-obsidian-800 px-3 py-1.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 text-xs">
                      <label htmlFor="fetch-constraint" className="text-[11px] font-medium text-obsidian/70 dark:text-cosmic-300">
                        Fetch Constraint:
                      </label>
                      <input
                        id="fetch-constraint"
                        type="number"
                        min={1}
                        max={25}
                        value={fetchLimit}
                        onChange={(e) => setFetchLimit(Math.max(1, Math.min(25, parseInt(e.target.value) || 5)))}
                        className="w-12 px-2 py-0.5 rounded-lg border border-cosmic-300 dark:border-obsidian-600 bg-white dark:bg-obsidian-900 text-center font-bold text-xs"
                      />
                      <span className="text-[10px] text-obsidian/50 dark:text-cosmic-400">companies (max 25)</span>
                    </div>

                    <button
                      type="button"
                      disabled={isDiscovering}
                      onClick={handleDiscoverCompanies}
                      className="btn-obsidian px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
                    >
                      {isDiscovering ? (
                        <>
                          <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                          <span>Fetching from Hunter...</span>
                        </>
                      ) : (
                        <>
                          <span>⚡</span>
                          <span>Fetch Companies</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Discovered Companies List */}
                {discoveredCompanies.length > 0 && (
                  <div className="mt-4 card-nested p-4 sm:p-5 rounded-2xl space-y-3 border border-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10">
                    <div className="flex items-center justify-between pb-2 border-b border-cosmic-200 dark:border-obsidian-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {discoveredCompanies.length} companies match your filters
                        </span>
                        <span className="text-[10px] text-obsidian/50 dark:text-cosmic-400">
                          (Select companies to move to Review for 22-signal scoring)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("leads")}
                        className="text-xs font-semibold text-lilac-600 dark:text-lilac-400 hover:underline flex items-center gap-1"
                      >
                        <span>Open Lead Pipeline</span>
                        <span>&rarr;</span>
                      </button>
                    </div>

                    <div className="divide-y divide-cosmic-200 dark:divide-obsidian-800">
                      {discoveredCompanies.map((comp) => {
                        const isMoved = movedCompanyDomains.has(comp.domain);
                        const isMoving = movingDomain === comp.domain;

                        return (
                          <div
                            key={comp.domain}
                            className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/40 dark:hover:bg-obsidian-800/40 px-2 rounded-xl transition"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-obsidian dark:text-cosmic-100">
                                  {comp.company_name}
                                </span>
                                <a
                                  href={`https://${comp.domain}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-mono text-lilac-600 dark:text-lilac-400 hover:underline"
                                >
                                  {comp.domain} &nearr;
                                </a>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-obsidian/60 dark:text-cosmic-400">
                                <span className="px-2 py-0.5 rounded-md bg-cosmic-100 dark:bg-obsidian-800 border border-cosmic-200 dark:border-obsidian-700">
                                  👥 {comp.employee_count}
                                </span>
                                <span>📍 {comp.location}</span>
                                <span>&bull;</span>
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                  ✉️ {comp.emails_count} email addresses
                                </span>
                              </div>
                            </div>

                            <div>
                              <button
                                type="button"
                                disabled={isMoved || isMoving}
                                onClick={() => handleMoveToReview(comp)}
                                className={`px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                                  isMoved
                                    ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 cursor-default"
                                    : "btn-obsidian cursor-pointer hover:scale-[1.02]"
                                }`}
                              >
                                {isMoving ? (
                                  <>
                                    <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                                    <span>Moving...</span>
                                  </>
                                ) : isMoved ? (
                                  <>
                                    <span>✓</span>
                                    <span>Moved to Review</span>
                                  </>
                                ) : (
                                  <>
                                    <span>📥</span>
                                    <span>Move to Review</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="pt-4 border-t border-cosmic-200 dark:border-obsidian-800 flex items-center justify-end">
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

          {/* Manual form teaser banner */}
          {!showManualForm && (
            <div
              onClick={() => setShowManualForm(true)}
              className="glass-panel card-cosmic rounded-3xl p-5 border border-dashed border-cosmic-300 dark:border-obsidian-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:border-lilac-400 dark:hover:border-lilac-400 transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 flex items-center justify-center font-bold text-sm border border-lilac-200 dark:border-obsidian-700 group-hover:scale-105 transition">
                  ⚙️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-obsidian dark:text-cosmic-100">
                      Manual ICP Criteria Configuration
                    </h4>
                  </div>
                  <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                    Click to add criteria: 58 industries, geographic regions, employee ranges, HubSpot suppression & Hunter.io discovery.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowManualForm(true);
                }}
                className="btn-obsidian px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                <span>+ Add Manually</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
