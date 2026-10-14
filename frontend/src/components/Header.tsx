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
    <header className="sticky top-0 z-50 bg-[#0D0D12] text-cosmic-100 border-b border-obsidian-800 shadow-md transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Logo & Status */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white text-obsidian flex items-center justify-center font-black text-xs sm:text-sm tracking-wider border border-white/20 group-hover:scale-[1.03] transition-transform shadow-sm">
              LF
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white tracking-tight">LeadFlow</span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider bg-lilac-950/80 text-lilac-300 rounded-full border border-lilac-800/60">
                Live 22-Signal
              </span>
            </div>
          </Link>

          {/* Current Role Indicator Pill */}
          <div className="hidden xl:flex items-center gap-1.5 pl-3 border-l border-obsidian-700">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lilac-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lilac-500"></span>
            </span>
            <span className="text-[11px] font-medium text-cosmic-300 tracking-wide">
              Role: <span className="font-bold text-white font-mono">{currentRoleName}</span>
            </span>
          </div>
        </div>

        {/* Center: Contextual Navigation based on Direct URL */}
        <div>
          {pathname === "/portal" || pathname === "/super-admin" ? (
            /* User requirement: remove verified leads button for client and multi-tenant oversight button for super admin */
            null
          ) : (
            <div className="flex items-center space-x-1 bg-obsidian-900/90 p-1 rounded-2xl border border-obsidian-700 text-xs">
              <Link
                href="/"
                onClick={() => setActiveTab("leads")}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                  pathname === "/" && activeTab === "leads"
                    ? "bg-obsidian-800 text-white border border-obsidian-600 shadow-sm"
                    : "text-cosmic-300/80 hover:text-white hover:bg-obsidian-800/60"
                }`}
              >
                <span>Lead Pipeline</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/" && activeTab === "leads"
                      ? "bg-lilac-400 text-obsidian-950"
                      : "bg-obsidian-800 text-cosmic-300 border border-obsidian-700"
                  }`}
                >
                  {leadsCount}
                </span>
              </Link>

              <Link
                href="/icp"
                onClick={() => setActiveTab("icp")}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                  pathname === "/icp" || (pathname === "/" && activeTab === "icp")
                    ? "bg-obsidian-800 text-white border border-obsidian-600 shadow-sm"
                    : "text-cosmic-300/80 hover:text-white hover:bg-obsidian-800/60"
                }`}
              >
                <span>Audiences (ICP)</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/icp" || (pathname === "/" && activeTab === "icp")
                      ? "bg-emerald-400 text-obsidian-950"
                      : "bg-obsidian-800 text-cosmic-300 border border-obsidian-700"
                  }`}
                >
                  Builder
                </span>
              </Link>

              <Link
                href="/"
                onClick={() => setActiveTab("integrations")}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                  pathname === "/" && activeTab === "integrations"
                    ? "bg-obsidian-800 text-white border border-obsidian-600 shadow-sm"
                    : "text-cosmic-300/80 hover:text-white hover:bg-obsidian-800/60"
                }`}
              >
                <span>Signal Engines</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/" && activeTab === "integrations"
                      ? "bg-lilac-400 text-obsidian-950"
                      : "bg-obsidian-800 text-cosmic-300 border border-obsidian-700"
                  }`}
                >
                  22 Signals
                </span>
              </Link>
            </div>
          )}
        </div>

        {/* Right: Theme Toggle & User Profile */}
        <div className="flex items-center space-x-2.5">
          {/* Light / Dark Mode Toggle Button with Precise Sun Icon */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="w-8 h-8 rounded-xl border border-obsidian-700 bg-obsidian-800/90 flex items-center justify-center hover:bg-obsidian-700 transition cursor-pointer"
            title={theme === "light" ? "Light theme active (click to switch to Dark Mode)" : "Dark theme active (click to switch to Light Mode)"}
          >
            {theme === "light" ? (
              /* Precise Radiant Sun Icon with 8 Balanced Radial Rays */
              <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.25" />
                <line x1="12" y1="2" x2="12" y2="4.5" />
                <line x1="12" y1="19.5" x2="12" y2="22" />
                <line x1="4.22" y1="4.22" x2="5.99" y2="5.99" />
                <line x1="18.01" y1="18.01" x2="19.78" y2="19.78" />
                <line x1="2" y1="12" x2="4.5" y2="12" />
                <line x1="19.5" y1="12" x2="22" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.99" y2="18.01" />
                <line x1="18.01" y1="5.99" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              /* Crisp Moon Icon for Dark Theme */
              <svg className="w-4 h-4 text-cosmic-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* User Profile on Extreme Right */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="px-3 py-1.5 rounded-2xl bg-obsidian-800 hover:bg-obsidian-700 border border-obsidian-700 transition flex items-center gap-2.5 cursor-pointer"
              >
                <div className="w-7 h-7 rounded-xl bg-white text-obsidian flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                  {displayName.charAt(0)}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-white tracking-tight leading-tight">
                    {displayName}
                  </div>
                  <div className="text-[9px] text-cosmic-400 uppercase font-mono font-medium">
                    {activeMembership?.org_name || "Workspace"}
                  </div>
                </div>
                <span className="text-[9px] text-cosmic-400">▼</span>
              </button>

              {/* Profile Dropdown: Displays info, org switcher, and Logout */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-60 bg-obsidian-900 rounded-2xl shadow-2xl py-2 z-50 text-xs border border-obsidian-700 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3.5 py-2 border-b border-obsidian-800">
                    <div className="font-bold text-white text-xs truncate">{displayName}</div>
                    <div className="text-[11px] text-cosmic-400 truncate">{user.email}</div>
                  </div>

                  {user.memberships.length > 1 && (
                    <div className="py-1 border-b border-obsidian-800">
                      <div className="px-3.5 py-1 text-[9px] uppercase font-mono tracking-wider font-bold text-cosmic-400">
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
                          className={`w-full text-left px-3.5 py-1.5 hover:bg-obsidian-800 flex items-center justify-between transition ${
                            m.org_id === activeMembership?.org_id
                              ? "font-bold text-white bg-obsidian-800"
                              : "text-cosmic-300"
                          }`}
                        >
                          <span className="truncate">{m.org_name}</span>
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-obsidian-700 text-cosmic-300">
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
                      className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-950/40 font-semibold flex items-center gap-2 transition"
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
                className="text-xs font-semibold px-3 py-1.5 rounded-xl text-cosmic-200 hover:text-white hover:bg-obsidian-800 transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-white text-obsidian hover:bg-cosmic-100 text-xs font-bold px-3.5 py-1.5 rounded-xl transition shadow-sm"
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
