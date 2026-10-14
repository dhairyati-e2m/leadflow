"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function Header() {
  const { user, activeMembership, switchOrganization, logout } = useAuth();
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-blush-200/70 shadow-sm transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Platform Status */}
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-obsidian text-cosmic-100 flex items-center justify-center font-bold text-sm tracking-wider shadow-obsidian border border-obsidian-200 group-hover:scale-[1.03] transition-transform">
              LF
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-obsidian tracking-tight">LeadFlow</span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider bg-lilac-100 text-lilac-700 rounded-full border border-lilac-200/80">
                Live 22-Signal
              </span>
            </div>
          </Link>

          {/* Handbook 2.2 Operator Elevation Badge */}
          <div className="hidden lg:flex items-center gap-1.5 pl-4 border-l border-cosmic-300/80">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lilac-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lilac-600"></span>
            </span>
            <span className="text-[11px] font-medium text-obsidian-100/70 tracking-wide">
              Operator Pipeline: <span className="font-bold text-obsidian">Active</span>
            </span>
          </div>
        </div>

        {/* Funnel Flow Indicator (Handbook 5.3) */}
        <div className="hidden md:flex items-center space-x-1.5 bg-cosmic-200/50 border border-blush-200/60 rounded-full px-3 py-1 text-[11px] text-obsidian-50/70 font-medium">
          <span className="text-obsidian font-semibold">Review</span>
          <span className="text-blush-400 font-mono">→</span>
          <span className="text-obsidian font-semibold">Qualified</span>
          <span className="text-blush-400 font-mono">→</span>
          <span className="text-obsidian font-semibold">Approved</span>
          <span className="text-blush-400 font-mono">→</span>
          <span className="text-obsidian font-semibold">Drafted</span>
          <span className="text-blush-400 font-mono">→</span>
          <span className="text-lilac-700 font-bold flex items-center gap-1">
            HubSpot
            <span className="w-1.5 h-1.5 rounded-full bg-lilac-500"></span>
          </span>
        </div>

        {/* User Workspace & Actions */}
        <div className="flex items-center space-x-4">
          {user ? (
            <div className="flex items-center space-x-3">
              {/* Organization Switcher Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                  className="px-3 py-1.5 rounded-xl bg-cosmic-100/80 hover:bg-cosmic-200/80 border border-cosmic-300/80 transition flex items-center gap-2 cursor-pointer"
                >
                  <div className="text-left">
                    <div className="text-xs font-bold text-obsidian tracking-tight">
                      {activeMembership?.org_name || "Workspace"}
                    </div>
                    <div className="text-[9px] text-obsidian/60 uppercase font-mono font-medium">
                      {activeMembership?.role || "Member"}
                    </div>
                  </div>
                  {user.memberships.length > 1 && (
                    <span className="text-[10px] text-obsidian/50">▼</span>
                  )}
                </button>

                {showOrgDropdown && user.memberships.length > 1 && (
                  <div className="absolute right-0 mt-2 w-52 glass-panel rounded-2xl shadow-futuristic py-2 z-50 text-xs border border-blush-200">
                    <div className="px-3 py-1.5 text-[9px] uppercase font-mono tracking-wider font-bold text-obsidian/50 border-b border-blush-100">
                      Tenant Organizations
                    </div>
                    {user.memberships.map((m) => (
                      <button
                        key={m.org_id}
                        type="button"
                        onClick={() => {
                          switchOrganization(m.org_id);
                          setShowOrgDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-lilac-50/80 flex items-center justify-between transition ${
                          m.org_id === activeMembership?.org_id
                            ? "font-bold text-obsidian bg-lilac-100/60"
                            : "text-obsidian/80"
                        }`}
                      >
                        <span className="truncate">{m.org_name}</span>
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-cosmic-200 text-obsidian/60">
                          {m.role}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* User Avatar & Logout */}
              <div className="flex items-center space-x-2 border-l border-cosmic-300 pl-3">
                <div className="w-8 h-8 rounded-xl bg-obsidian text-cosmic-100 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                  {user.full_name ? user.full_name.slice(0, 2) : "OP"}
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-cosmic-300 text-obsidian/80 hover:text-obsidian hover:bg-cosmic-200/80 transition"
                >
                  Exit
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2.5">
              <Link
                href="/login"
                className="text-xs font-semibold px-3.5 py-2 rounded-xl text-obsidian/80 hover:text-obsidian hover:bg-cosmic-200/70 transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="btn-obsidian text-xs font-semibold px-4 py-2 rounded-xl shadow-obsidian"
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
