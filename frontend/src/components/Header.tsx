"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function Header() {
  const { user, activeMembership, switchOrganization, logout } = useAuth();
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            LF
          </div>
          <div>
            <span className="font-bold text-lg text-slate-900">LeadFlow</span>
            <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200">
              v1.0.0
            </span>
          </div>
        </Link>

        <div className="flex items-center space-x-4">
          {user ? (
            <div className="flex items-center space-x-4">
              {/* Organization & Switcher */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                  className="text-right hover:opacity-80 transition cursor-pointer flex items-center gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {activeMembership?.org_name || "Workspace"}
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">
                      Role: {activeMembership?.role || "Member"}
                    </div>
                  </div>
                  {user.memberships.length > 1 && (
                    <span className="text-xs text-slate-400">▼</span>
                  )}
                </button>

                {showOrgDropdown && user.memberships.length > 1 && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50 text-xs">
                    <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                      Switch Organization
                    </div>
                    {user.memberships.map((m) => (
                      <button
                        key={m.org_id}
                        type="button"
                        onClick={() => {
                          switchOrganization(m.org_id);
                          setShowOrgDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between ${
                          m.org_id === activeMembership?.org_id ? "font-bold text-blue-600" : "text-slate-700"
                        }`}
                      >
                        <span>{m.org_name}</span>
                        <span className="text-[10px] uppercase text-slate-400">{m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* User Avatar & Logout */}
              <div className="flex items-center space-x-2 border-l pl-4 border-slate-200">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
                  {user.full_name ? user.full_name.slice(0, 2) : "U"}
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
                >
                  Log out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Link
                href="/login"
                className="text-xs font-semibold px-3 py-2 text-slate-700 hover:text-slate-900 transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="text-xs font-semibold px-3.5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm"
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
