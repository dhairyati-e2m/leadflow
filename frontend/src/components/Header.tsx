"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNav } from "@/lib/nav-context";

export function Header() {
  const { user, activeMembership, switchOrganization, logout } = useAuth();
  const { activeTab, setActiveTab, setRole, leadsCount, theme, toggleTheme } = useNav();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const pathname = usePathname();

  // Sync role and activeTab according to route
  useEffect(() => {
    if (pathname === "/portal") {
      setRole("client_viewer");
      setActiveTab("portal");
    } else if (pathname === "/super-admin") {
      setRole("super_admin");
      setActiveTab("admin");
    } else if (pathname === "/icp") {
      setRole("org_admin");
      setActiveTab("icp");
    } else if (pathname === "/") {
      setRole("org_admin");
      if (activeTab === "portal" || activeTab === "admin" || activeTab === "audit") {
        setActiveTab("leads");
      }
    }
  }, [pathname, setRole, setActiveTab, activeTab]);

  const displayName = user?.full_name || "Operator";

  const currentRoleName =
    pathname === "/portal"
      ? "Client Viewer"
      : pathname === "/super-admin"
      ? "Super Admin"
      : "Org Admin";

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-blush-200/70 dark:border-obsidian-800 shadow-sm transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Logo & Status */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-obsidian text-cosmic-100 flex items-center justify-center font-bold text-xs sm:text-sm tracking-wider border border-obsidian-200 group-hover:scale-[1.03] transition-transform">
              LF
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-obsidian dark:text-cosmic-100 tracking-tight">LeadFlow</span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider bg-lilac-100 dark:bg-obsidian-800 text-lilac-800 dark:text-lilac-300 rounded-full border border-lilac-200/80 dark:border-obsidian-700">
                Live 22-Signal
              </span>
            </div>
          </Link>

          {/* Current Role Indicator Pill */}
          <div className="hidden xl:flex items-center gap-1.5 pl-3 border-l border-cosmic-300/80 dark:border-obsidian-700">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lilac-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lilac-600 dark:bg-lilac-400"></span>
            </span>
            <span className="text-[11px] font-medium text-obsidian/70 dark:text-cosmic-300 tracking-wide">
              Role: <span className="font-bold text-obsidian dark:text-cosmic-100 font-mono">{currentRoleName}</span>
            </span>
          </div>
        </div>

        {/* Center: Contextual Navigation based on Direct URL */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 bg-cosmic-100/90 dark:bg-obsidian-800/90 p-1 rounded-2xl border border-cosmic-300 dark:border-obsidian-700">
          {pathname === "/portal" ? (
            <Link
              href="/portal"
              className="px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold btn-obsidian flex items-center gap-1.5"
            >
              <span>Verified Leads</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Client Portal
              </span>
            </Link>
          ) : pathname === "/super-admin" ? (
            <Link
              href="/super-admin"
              className="px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold btn-obsidian flex items-center gap-1.5"
            >
              <span>Multi-Tenant Oversight</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-lilac-300 text-obsidian dark:bg-lilac-400 dark:text-obsidian-950">
                Super Admin
              </span>
            </Link>
          ) : (
            <>
              <Link
                href="/"
                onClick={() => setActiveTab("leads")}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  pathname === "/" && activeTab === "leads"
                    ? "btn-obsidian"
                    : "bg-transparent text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian dark:hover:text-cosmic-100 hover:bg-cosmic-200/80 dark:hover:bg-obsidian-700"
                }`}
              >
                <span>Lead Pipeline</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/" && activeTab === "leads"
                      ? "bg-lilac-300 text-obsidian dark:bg-lilac-400 dark:text-obsidian-950"
                      : "bg-cosmic-200 dark:bg-obsidian-900 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-300 dark:border-obsidian-700"
                  }`}
                >
                  {leadsCount}
                </span>
              </Link>

              <Link
                href="/icp"
                onClick={() => setActiveTab("icp")}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  pathname === "/icp" || (pathname === "/" && activeTab === "icp")
                    ? "btn-obsidian"
                    : "bg-transparent text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian dark:hover:text-cosmic-100 hover:bg-cosmic-200/80 dark:hover:bg-obsidian-700"
                }`}
              >
                <span>Audiences (ICP)</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/icp" || (pathname === "/" && activeTab === "icp")
                      ? "bg-emerald-300 text-obsidian dark:bg-emerald-400 dark:text-obsidian-950"
                      : "bg-cosmic-200 dark:bg-obsidian-900 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-300 dark:border-obsidian-700"
                  }`}
                >
                  Builder
                </span>
              </Link>

              <Link
                href="/"
                onClick={() => setActiveTab("integrations")}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  pathname === "/" && activeTab === "integrations"
                    ? "btn-obsidian"
                    : "bg-transparent text-obsidian/70 dark:text-cosmic-300 hover:text-obsidian dark:hover:text-cosmic-100 hover:bg-cosmic-200/80 dark:hover:bg-obsidian-700"
                }`}
              >
                <span>Signal Engines</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/" && activeTab === "integrations"
                      ? "bg-lilac-300 text-obsidian dark:bg-lilac-400 dark:text-obsidian-950"
                      : "bg-cosmic-200 dark:bg-obsidian-900 text-obsidian/70 dark:text-cosmic-300 border border-cosmic-300 dark:border-obsidian-700"
                  }`}
                >
                  22 Signals
                </span>
              </Link>
            </>
          )}
        </div>

        {/* Right: Theme Toggle & User Profile (Role toggle pill completely removed) */}
        <div className="flex items-center space-x-2.5">
          {/* Light / Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="w-8 h-8 rounded-xl border border-cosmic-300 dark:border-obsidian-700 bg-cosmic-100/80 dark:bg-obsidian-800 flex items-center justify-center text-obsidian dark:text-cosmic-100 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 transition cursor-pointer"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {theme === "light" ? (
              <svg className="w-4 h-4 text-obsidian" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* User Profile on Extreme Right */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="px-3 py-1.5 rounded-2xl bg-cosmic-100/90 dark:bg-obsidian-800 hover:bg-cosmic-200 dark:hover:bg-obsidian-700 border border-cosmic-300 dark:border-obsidian-700 transition flex items-center gap-2.5 cursor-pointer"
              >
                <div className="w-7 h-7 rounded-xl bg-obsidian dark:bg-cosmic-100 text-cosmic-100 dark:text-obsidian flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                  {displayName.charAt(0)}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-obsidian dark:text-cosmic-100 tracking-tight leading-tight">
                    {displayName}
                  </div>
                  <div className="text-[9px] text-obsidian/50 dark:text-cosmic-300 uppercase font-mono font-medium">
                    {activeMembership?.org_name || "Workspace"}
                  </div>
                </div>
                <span className="text-[9px] text-obsidian/40 dark:text-cosmic-400">▼</span>
              </button>

              {/* Profile Dropdown: Displays info, org switcher, and Logout */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-60 glass-panel dark:bg-obsidian-900 rounded-2xl shadow-xl py-2 z-50 text-xs border border-blush-200 dark:border-obsidian-700 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3.5 py-2 border-b border-cosmic-200 dark:border-obsidian-700">
                    <div className="font-bold text-obsidian dark:text-cosmic-100 text-xs truncate">{displayName}</div>
                    <div className="text-[11px] text-obsidian/60 dark:text-cosmic-400 truncate">{user.email}</div>
                  </div>

                  {user.memberships.length > 1 && (
                    <div className="py-1 border-b border-cosmic-200 dark:border-obsidian-700">
                      <div className="px-3.5 py-1 text-[9px] uppercase font-mono tracking-wider font-bold text-obsidian/40 dark:text-cosmic-400">
                        Switch Organization
                      </div>
                      {user.memberships.map((m) => (
                        <button
                          key={m.org_id}
                          type="button"
                          onClick={() => {
                            switchOrganization(m.org_id);
                            setShowProfileMenu(false);
                          }}
                          className={`w-full text-left px-3.5 py-1.5 hover:bg-lilac-50/80 dark:hover:bg-obsidian-800 flex items-center justify-between transition ${
                            m.org_id === activeMembership?.org_id
                              ? "font-bold text-obsidian dark:text-cosmic-100 bg-lilac-100/60 dark:bg-obsidian-800"
                              : "text-obsidian/80 dark:text-cosmic-300"
                          }`}
                        >
                          <span className="truncate">{m.org_name}</span>
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-cosmic-200 dark:bg-obsidian-700 text-obsidian/60">
                            {m.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Distinct Logout Button */}
                  <div className="pt-1 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold flex items-center gap-2 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Link
                href="/login"
                className="text-xs font-semibold px-3 py-2 rounded-xl text-obsidian/80 dark:text-cosmic-200 hover:text-obsidian hover:bg-cosmic-200/70 transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="btn-obsidian text-xs font-semibold px-3.5 py-2 rounded-xl"
              >
                Create Workspace
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
