"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNav } from "@/lib/nav-context";

export function WelcomeLanding() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { setRole, setActiveTab } = useNav();

  const [activeTab, setActiveAuthTab] = useState<"quick" | "login" | "register">("quick");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Demo Login Handler
  const handleQuickRoleLogin = async (targetRole: "org_admin" | "client_viewer" | "super_admin") => {
    setIsSubmitting(true);
    setErrorMsg(null);
    // Pre-emptively set role and tab so the header renders the correct role immediately without lag
    setRole(targetRole);
    if (targetRole === "client_viewer") {
      setActiveTab("portal");
    } else if (targetRole === "super_admin") {
      setActiveTab("admin");
    } else {
      setActiveTab("leads");
    }

    try {
      let testEmail = "admin@leadflow.io";
      if (targetRole === "client_viewer") testEmail = "client@acme.com";
      if (targetRole === "super_admin") testEmail = "superadmin@leadflow.io";

      await login(testEmail, "password123");

      if (targetRole === "client_viewer") {
        router.push("/portal");
      } else if (targetRole === "super_admin") {
        router.push("/super-admin");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const { isSuperAdmin, role } = await login(email, password);
      if (isSuperAdmin) {
        setRole("super_admin");
        setActiveTab("admin");
        router.push("/super-admin");
      } else if (role === "client_viewer" || role === "reviewer") {
        setRole("client_viewer");
        setActiveTab("portal");
        router.push("/portal");
      } else {
        setRole("org_admin");
        setActiveTab("leads");
        router.push("/");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await register(email, password, fullName, orgName);
      setRole("org_admin");
      setActiveTab("leads");
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-6 sm:py-10 max-w-7xl mx-auto space-y-12">
      {/* 2-Column Hero: Left Intro & Login / Register | Right Symbolic Platform Functionality Graphic */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Welcome Statement & Authentication Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lilac-100 dark:bg-obsidian-800 border border-lilac-200 dark:border-obsidian-700 text-lilac-800 dark:text-lilac-300 text-xs font-mono font-bold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-lilac-500 animate-pulse"></span>
              Autonomous B2B Lead Intelligence & Qualification
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-obsidian dark:text-cosmic-100 tracking-tight leading-tight">
              High-Precision Lead Scoring, Safe Web Audits & CRM Pipeline
            </h1>
            <p className="text-obsidian/70 dark:text-cosmic-300 text-sm sm:text-base leading-relaxed max-w-xl">
              Welcome to <strong>LeadFlow</strong>. Automate prospects through local DOM crawlers, Core Web Vitals checks, and 22-signal deterministic scoring—strictly with zero paid API overhead before syncing approved outreach to HubSpot.
            </p>
          </div>

          {/* Authentication Card */}
          <div className="glass-panel card-cosmic rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700">
            {/* Auth Mode Tabs */}
            <div className="flex items-center space-x-1.5 p-1 bg-cosmic-100 dark:bg-obsidian-800 rounded-2xl border border-cosmic-300 dark:border-obsidian-700 text-xs font-semibold mb-6">
              <button
                type="button"
                onClick={() => setActiveAuthTab("quick")}
                className={`flex-1 py-2 rounded-xl transition ${
                  activeTab === "quick" ? "btn-obsidian shadow-sm" : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
                }`}
              >
                ⚡ Quick Role Demo
              </button>
              <button
                type="button"
                onClick={() => setActiveAuthTab("login")}
                className={`flex-1 py-2 rounded-xl transition ${
                  activeTab === "login" ? "btn-obsidian shadow-sm" : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setActiveAuthTab("register")}
                className={`flex-1 py-2 rounded-xl transition ${
                  activeTab === "register" ? "btn-obsidian shadow-sm" : "text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian"
                }`}
              >
                Create Workspace
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 text-xs font-semibold text-rose-950 dark:text-rose-200">
                {errorMsg}
              </div>
            )}

            {/* TAB 1: Quick Role Login (Immediate Access for Testing) */}
            {activeTab === "quick" && (
              <div className="space-y-3">
                <p className="text-xs text-obsidian/60 dark:text-cosmic-400 mb-2">
                  Select a pre-seeded authorized role to enter that role's dedicated environment:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Org Admin Card */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleQuickRoleLogin("org_admin")}
                    className="card-nested p-4 rounded-2xl text-left border border-cosmic-200 dark:border-obsidian-700 hover:scale-[1.02] transition-transform cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-obsidian/60 dark:text-cosmic-400">Role 1</span>
                      <span className="w-2 h-2 rounded-full bg-lilac-500"></span>
                    </div>
                    <div className="font-bold text-sm text-obsidian dark:text-cosmic-100 mt-1">
                      Org Admin
                    </div>
                    <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                      Full pipeline, ICP editor & signal engines
                    </div>
                  </button>

                  {/* Client Viewer Card */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleQuickRoleLogin("client_viewer")}
                    className="card-nested p-4 rounded-2xl text-left border border-cosmic-200 dark:border-obsidian-700 hover:scale-[1.02] transition-transform cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400">Role 2</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    </div>
                    <div className="font-bold text-sm text-obsidian dark:text-cosmic-100 mt-1">
                      Client Viewer
                    </div>
                    <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                      Verified leads portal (zero cost cards)
                    </div>
                  </button>

                  {/* Super Admin Card */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleQuickRoleLogin("super_admin")}
                    className="card-nested p-4 rounded-2xl text-left border border-cosmic-200 dark:border-obsidian-700 hover:scale-[1.02] transition-transform cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-lilac-700 dark:text-lilac-300">Role 3</span>
                      <span className="w-2 h-2 rounded-full bg-lilac-600"></span>
                    </div>
                    <div className="font-bold text-sm text-obsidian dark:text-cosmic-100 mt-1">
                      Super Admin
                    </div>
                    <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400 mt-0.5">
                      Multi-tenant oversight & audit logs
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Standard Sign In */}
            {activeTab === "login" && (
              <form onSubmit={handleStandardLogin} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@company.com"
                    className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs p-3 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 btn-obsidian font-semibold rounded-xl text-xs transition shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? "Authenticating..." : "Sign In & Enter Platform"}
                </button>
              </form>
            )}

            {/* TAB 3: Create Workspace */}
            {activeTab === "register" && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Sarah Jenkins"
                      className="w-full text-xs p-2.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                      Organization Name
                    </label>
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Acme Growth Inc"
                      className="w-full text-xs p-2.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@acme.com"
                    className="w-full text-xs p-2.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/60 dark:text-cosmic-400 mb-1">
                    Password (Min 8 Characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs p-2.5 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-white/90 dark:bg-obsidian-800 text-obsidian dark:text-cosmic-100 focus:outline-none focus:ring-2 focus:ring-lilac-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 btn-obsidian font-semibold rounded-xl text-xs transition shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? "Creating Workspace..." : "Create Organization & Enter"}
                </button>
                <p className="text-[11px] text-obsidian/60 dark:text-cosmic-400 text-center mt-2 leading-relaxed">
                  Need to join an existing organization instead? Sign in and use <strong>Request Access</strong> to submit a pending membership request.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: High-Tech Symbolic Platform Architecture & Functionality Graphic (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel card-cosmic rounded-3xl p-6 sm:p-7 shadow-futuristic border border-blush-200/80 dark:border-obsidian-700 relative overflow-hidden">
            {/* Background ambient decorative glow */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-lilac-400/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center justify-between pb-3 border-b border-cosmic-200 dark:border-obsidian-800">
              <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-obsidian/70 dark:text-cosmic-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-lilac-500"></span>
                FEATURES
              </span>
            </div>

            {/* Symbolic Functional Pipeline Diagram */}
            <div className="space-y-3.5 my-4">
              {/* Node 1: Sourcing & Web Scraping */}
              <div className="card-nested p-3.5 rounded-2xl flex items-center justify-between border border-cosmic-200 dark:border-obsidian-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-obsidian text-white flex items-center justify-center font-bold text-xs">
                    🕷
                  </div>
                  <div>
                    <div className="font-bold text-xs text-obsidian dark:text-cosmic-100">Safe Web Crawler & DOM Scraping</div>
                    <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400">Next.js Jamstack, Viewports, Semantic HTML5</div>
                  </div>
                </div>
              </div>

              {/* Node 2: Technical & Growth Enrichment */}
              <div className="card-nested p-3.5 rounded-2xl flex items-center justify-between border border-cosmic-200 dark:border-obsidian-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-obsidian text-white flex items-center justify-center font-bold text-xs">
                    ⚡
                  </div>
                  <div>
                    <div className="font-bold text-xs text-obsidian dark:text-cosmic-100">Enrichment & Performance Audit</div>
                    <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400">PageSpeed Core Web Vitals, TLS / SSL & DNS</div>
                  </div>
                </div>
              </div>

              {/* Node 3: 22-Signal Scoring Engine */}
              <div className="card-nested p-3.5 rounded-2xl flex items-center justify-between border border-cosmic-200 dark:border-obsidian-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-obsidian text-white flex items-center justify-center font-bold text-xs">
                    🎯
                  </div>
                  <div>
                    <div className="font-bold text-xs text-obsidian dark:text-cosmic-100">22-Signal Deterministic Scoring</div>
                    <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400">10 Website Architecture + 12 Marketing Signals</div>
                  </div>
                </div>
              </div>

              {/* Node 4: AI Outreach Draft Studio */}
              <div className="card-nested p-3.5 rounded-2xl flex items-center justify-between border border-cosmic-200 dark:border-obsidian-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-obsidian text-white flex items-center justify-center font-bold text-xs">
                    ✍
                  </div>
                  <div>
                    <div className="font-bold text-xs text-obsidian dark:text-cosmic-100">Human-Approved Outreach Studio</div>
                    <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400">Bespoke technical pain-point email generation</div>
                  </div>
                </div>
              </div>

              {/* Node 5: HubSpot CRM Sync */}
              <div className="card-nested p-3.5 rounded-2xl flex items-center justify-between border border-cosmic-200 dark:border-obsidian-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-lilac-600 text-white flex items-center justify-center font-bold text-xs">
                    🔄
                  </div>
                  <div>
                    <div className="font-bold text-xs text-obsidian dark:text-cosmic-100">HubSpot Verified CRM Sync</div>
                    <div className="text-[10px] text-obsidian/60 dark:text-cosmic-400">Credit-safe contact reveal & sales handoff</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
