"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNav } from "@/lib/nav-context";
import { TransferAdminModal } from "@/components/TransferAdminModal";
import { RequestAccessModal } from "@/components/RequestAccessModal";
import {
  NotificationItem,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api";

export function Header() {
  const { user, activeMembership, switchOrganization, logout } = useAuth();
  const { role, activeTab, setActiveTab, setRole, leadsCount, theme, toggleTheme } = useNav();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Load and refresh notifications
  const loadNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetchNotifications(15);
      setNotifications(res.items);
      setUnreadCount(res.unread_count);
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    loadNotifications();

    const interval = setInterval(loadNotifications, 30000);
    const onFocus = () => loadNotifications();
    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onFocus);
    };
  }, [user]);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setShowNotifMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
      const isClient =
        activeMembership?.role === "client_viewer" ||
        activeMembership?.role === "reviewer" ||
        role === "client_viewer";
      const isSuper = Boolean(user?.is_superuser) || role === "super_admin";
      if (!isSuper && !isClient) {
        setRole("org_admin");
        if (activeTab === "portal" || activeTab === "admin" || activeTab === "audit") {
          setActiveTab("leads");
        }
      }
    }
  }, [pathname, user?.is_superuser, activeMembership?.role, role, setRole, setActiveTab]);

  const displayName = user?.full_name || "Operator";

  // Synchronous, instantaneous role resolution to prevent any split-second flashing
  const isSuperUser =
    Boolean(user?.is_superuser) || role === "super_admin" || pathname === "/super-admin";
  const isClientRole =
    !isSuperUser &&
    (role === "client_viewer" ||
      activeMembership?.role === "client_viewer" ||
      activeMembership?.role === "reviewer" ||
      pathname === "/portal");

  const resolvedRole = isSuperUser
    ? "super_admin"
    : isClientRole
    ? "client_viewer"
    : "org_admin";

  const currentRoleName =
    resolvedRole === "client_viewer"
      ? "Client Viewer"
      : resolvedRole === "super_admin"
      ? "Super Admin"
      : "Org Admin";

  return (
    <header className="sticky top-0 z-50 bg-[#0D0D12] text-cosmic-100 border-b border-obsidian-800 dark:bg-[#0D0D12] dark:text-cosmic-100 dark:border-b dark:border-[#FAF7F2] shadow-md transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Logo & Status */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white text-obsidian dark:bg-obsidian dark:text-white flex items-center justify-center font-black text-xs sm:text-sm tracking-wider border border-white/20 dark:border-obsidian/20 group-hover:scale-[1.03] transition-transform shadow-sm">
              LF
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white dark:text-white tracking-tight">LeadFlow</span>
              {user && (
                <span className="hidden sm:inline-block px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider bg-lilac-950/80 text-lilac-300 dark:bg-lilac-100 dark:text-lilac-800 dark:border-lilac-300 rounded-full border border-lilac-800/60">
                  Live 22-Signal
                </span>
              )}
            </div>
          </Link>

          {/* Current Role Indicator Pill: Only visible when logged in */}
          {user && (
            <div className="hidden xl:flex items-center gap-1.5 pl-3 border-l border-obsidian-700 dark:border-obsidian-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lilac-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-lilac-500"></span>
              </span>
              <span className="text-[11px] font-medium text-cosmic-300 dark:text-cosmic-300 tracking-wide">
                Role: <span className="font-bold text-white dark:text-white font-mono">{currentRoleName}</span>
              </span>
            </div>
          )}
        </div>

        {/* Center: Contextual Navigation based on Direct URL - Only visible when logged in */}
        <div>
          {!user || resolvedRole !== "org_admin" || pathname === "/portal" || pathname === "/super-admin" ? (
            null
          ) : (
            <div className="flex items-center space-x-1 bg-obsidian-900/90 dark:bg-cosmic-200/90 p-1 rounded-2xl border border-obsidian-700 dark:border-cosmic-300 text-xs">
              <Link
                href="/"
                onClick={() => setActiveTab("leads")}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
                  pathname === "/" && activeTab === "leads"
                    ? "border-2 border-lilac-500 text-white dark:text-obsidian bg-obsidian-800/90 dark:bg-cosmic-100 shadow-sm"
                    : "border-2 border-transparent text-cosmic-300/80 hover:text-white dark:text-obsidian/75 dark:hover:text-obsidian hover:bg-obsidian-800/60 dark:hover:bg-cosmic-300/60"
                }`}
              >
                <span>Lead Pipeline</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/" && activeTab === "leads"
                      ? "bg-lilac-500/20 text-lilac-300 dark:text-lilac-700 border border-lilac-500/40"
                      : "bg-obsidian-800 text-cosmic-300 dark:bg-cosmic-100 dark:text-obsidian-700 border border-obsidian-700 dark:border-cosmic-300"
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
                    ? "border-2 border-lilac-500 text-white dark:text-obsidian bg-obsidian-800/90 dark:bg-cosmic-100 shadow-sm"
                    : "border-2 border-transparent text-cosmic-300/80 hover:text-white dark:text-obsidian/75 dark:hover:text-obsidian hover:bg-obsidian-800/60 dark:hover:bg-cosmic-300/60"
                }`}
              >
                <span>Audiences (ICP)</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/icp" || (pathname === "/" && activeTab === "icp")
                      ? "bg-emerald-400 text-obsidian-950 font-bold"
                      : "bg-obsidian-800 text-cosmic-300 dark:bg-cosmic-100 dark:text-obsidian-700 border border-obsidian-700 dark:border-cosmic-300"
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
                    ? "border-2 border-lilac-500 text-white dark:text-obsidian bg-obsidian-800/90 dark:bg-cosmic-100 shadow-sm"
                    : "border-2 border-transparent text-cosmic-300/80 hover:text-white dark:text-obsidian/75 dark:hover:text-obsidian hover:bg-obsidian-800/60 dark:hover:bg-cosmic-300/60"
                }`}
              >
                <span>Signal Engines</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                    pathname === "/" && activeTab === "integrations"
                      ? "bg-lilac-500/20 text-lilac-300 dark:text-lilac-700 border border-lilac-500/40"
                      : "bg-obsidian-800 text-cosmic-300 dark:bg-cosmic-100 dark:text-obsidian-700 border border-obsidian-700 dark:border-cosmic-300"
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
          {/* Light / Dark Mode Toggle Button with Precise Sun / Moon Icon */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="w-8 h-8 rounded-xl border border-obsidian-700 dark:border-cosmic-300 bg-obsidian-800/90 dark:bg-cosmic-200/90 flex items-center justify-center hover:bg-obsidian-700 dark:hover:bg-cosmic-300 transition cursor-pointer"
            title={theme === "light" ? "Light theme active (click to switch to Dark Mode)" : "Dark theme active (click to switch to Light Mode)"}
          >
            {theme === "light" ? (
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
              <svg className="w-4 h-4 text-obsidian" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Notification Bell with Unread Badge */}
          {user && (
            <div className="relative" ref={notifMenuRef}>
              <button
                type="button"
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                className="relative w-8 h-8 rounded-xl border border-obsidian-700 dark:border-cosmic-300 bg-obsidian-800/90 dark:bg-cosmic-200/90 flex items-center justify-center hover:bg-obsidian-700 dark:hover:bg-cosmic-300 transition cursor-pointer"
                title="Notifications"
              >
                <svg className="w-4 h-4 text-cosmic-200 dark:text-obsidian" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-lilac-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse shadow-sm">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {showNotifMenu && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-obsidian-900 dark:bg-[#FAF7F2] rounded-2xl shadow-2xl py-2 z-50 text-xs border border-obsidian-700 dark:border-cosmic-300 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-2.5 border-b border-obsidian-800 dark:border-cosmic-200 flex items-center justify-between">
                    <div className="font-bold text-white dark:text-obsidian text-xs flex items-center gap-1.5">
                      <span>Notifications</span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-lilac-500/20 text-lilac-400 font-mono">
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          await markAllNotificationsRead().catch(() => {});
                          loadNotifications();
                        }}
                        className="text-[10px] text-lilac-400 dark:text-lilac-700 hover:underline font-semibold"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-obsidian-800 dark:divide-cosmic-200">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-cosmic-400 dark:text-obsidian/50 text-xs">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={async () => {
                            if (!n.is_read) {
                              await markNotificationRead(n.id).catch(() => {});
                              loadNotifications();
                            }
                            if (n.link) {
                              setShowNotifMenu(false);
                              router.push(n.link);
                            }
                          }}
                          className={`p-3.5 transition cursor-pointer hover:bg-obsidian-800/80 dark:hover:bg-cosmic-100 ${
                            !n.is_read ? "bg-lilac-950/20 dark:bg-lilac-50/50" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-white dark:text-obsidian text-xs leading-snug">
                              {n.title}
                            </div>
                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-lilac-500 shrink-0 mt-1"></span>
                            )}
                          </div>
                          <div className="text-[11px] text-cosmic-300 dark:text-obsidian/75 mt-1 whitespace-pre-line leading-relaxed">
                            {n.message}
                          </div>
                          <div className="text-[9px] font-mono text-cosmic-500 dark:text-obsidian/40 mt-1.5">
                            {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Profile on Extreme Right */}
          {user ? (
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="px-3 py-1.5 rounded-2xl bg-obsidian-800 hover:bg-obsidian-700 dark:bg-cosmic-200 dark:hover:bg-cosmic-300 border border-obsidian-700 dark:border-cosmic-300 transition flex items-center gap-2.5 cursor-pointer"
              >
                <div className="w-7 h-7 rounded-xl bg-white text-obsidian dark:bg-obsidian dark:text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                  {displayName.charAt(0)}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-white dark:text-obsidian tracking-tight leading-tight">
                    {displayName}
                  </div>
                  <div className="text-[9px] text-cosmic-400 dark:text-obsidian/60 uppercase font-mono font-medium">
                    {activeMembership?.org_name || "Workspace"}
                  </div>
                </div>
                <span className="text-[9px] text-cosmic-400 dark:text-obsidian/60">▼</span>
              </button>

              {/* Profile Dropdown: Displays info, org switcher, and Logout */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-60 bg-obsidian-900 dark:bg-[#FAF7F2] rounded-2xl shadow-2xl py-2 z-50 text-xs border border-obsidian-700 dark:border-cosmic-300 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3.5 py-2 border-b border-obsidian-800 dark:border-cosmic-200">
                    <div className="font-bold text-white dark:text-obsidian text-xs truncate">{displayName}</div>
                    <div className="text-[11px] text-cosmic-400 dark:text-obsidian/60 truncate">{user.email}</div>
                  </div>

                  {user.memberships.length > 1 && (
                    <div className="py-1 border-b border-obsidian-800 dark:border-cosmic-200">
                      <div className="px-3.5 py-1 text-[9px] uppercase font-mono tracking-wider font-bold text-cosmic-400 dark:text-obsidian/60">
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
                          className={`w-full text-left px-3.5 py-1.5 hover:bg-obsidian-800 dark:hover:bg-cosmic-200 flex items-center justify-between transition ${
                            m.org_id === activeMembership?.org_id
                              ? "font-bold text-white bg-obsidian-800 dark:text-obsidian dark:bg-cosmic-200"
                              : "text-cosmic-300 dark:text-obsidian/75"
                          }`}
                        >
                          <span className="truncate">{m.org_name}</span>
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-obsidian-700 dark:bg-cosmic-300 text-cosmic-300 dark:text-obsidian">
                            {m.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Request Organisation Access Option */}
                  <div className="pt-1 px-1 border-t border-obsidian-800 dark:border-cosmic-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowAccessModal(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-cosmic-300 hover:bg-obsidian-800 dark:text-obsidian/80 dark:hover:bg-cosmic-200 font-semibold flex items-center gap-2 transition cursor-pointer"
                    >
                      <span className="text-xs">🏢</span>
                      <span>Request Org Access</span>
                    </button>
                  </div>

                  {/* Org Admin Role Transfer Option */}
                  {(activeMembership?.role === "owner" || activeMembership?.role === "admin") && (
                    <div className="pt-1 px-1 border-t border-obsidian-800 dark:border-cosmic-200">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowTransferModal(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-lilac-400 hover:bg-lilac-950/40 dark:text-lilac-700 dark:hover:bg-lilac-100 font-semibold flex items-center gap-2 transition cursor-pointer"
                      >
                        <span className="text-xs">👑</span>
                        <span>Transfer Admin Role</span>
                      </button>
                    </div>
                  )}

                  {/* Distinct Logout Button */}
                  <div className="pt-1 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                        window.location.href = "/";
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-950/40 dark:text-rose-600 dark:hover:bg-rose-100 font-semibold flex items-center gap-2 transition cursor-pointer"
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
                className="text-xs font-semibold px-3 py-1.5 rounded-xl text-cosmic-200 hover:text-white dark:text-obsidian/75 dark:hover:text-obsidian hover:bg-obsidian-800 dark:hover:bg-cosmic-200 transition"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-white text-obsidian hover:bg-cosmic-100 dark:bg-obsidian dark:text-white dark:hover:bg-obsidian-800 text-xs font-bold px-3.5 py-1.5 rounded-xl transition shadow-sm"
              >
                Create Workspace
              </Link>
            </div>
          )}
        </div>
      </div>

      {showTransferModal && activeMembership && (
        <TransferAdminModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          orgId={activeMembership.org_id}
          orgName={activeMembership.org_name}
        />
      )}

      {showAccessModal && (
        <RequestAccessModal
          isOpen={showAccessModal}
          onClose={() => setShowAccessModal(false)}
        />
      )}
    </header>
  );
}
