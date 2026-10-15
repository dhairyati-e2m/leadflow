"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type UserRole = "org_admin" | "super_admin" | "client_viewer";
export type NavTab = "leads" | "icp" | "integrations" | "portal" | "admin" | "audit" | "access_requests";
type ThemeMode = "light" | "dark";

interface NavContextType {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  leadsCount: number;
  setLeadsCount: (count: number) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const NavContext = createContext<NavContextType | undefined>(undefined);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<NavTab>("leads");
  const [role, setRoleState] = useState<UserRole>("org_admin");
  const [leadsCount, setLeadsCount] = useState<number>(3);
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("leadflow_theme") as ThemeMode | null;
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath === "/portal") {
        setRoleState("client_viewer");
        setActiveTab("portal");
        return;
      } else if (currentPath === "/super-admin") {
        setRoleState("super_admin");
        setActiveTab("admin");
        return;
      }
    }

    const savedRole = localStorage.getItem("leadflow_role") as UserRole | null;
    if (savedRole && ["org_admin", "super_admin", "client_viewer"].includes(savedRole)) {
      setRoleState(savedRole);
      if (savedRole === "client_viewer") {
        setActiveTab("portal");
      }
    }
  }, []);

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem("leadflow_role", newRole);
    if (newRole === "client_viewer" && (activeTab === "leads" || activeTab === "integrations" || activeTab === "admin" || activeTab === "access_requests")) {
      setActiveTab("portal");
    } else if (newRole === "org_admin" && (activeTab === "admin" || activeTab === "audit" || activeTab === "portal")) {
      setActiveTab("leads");
    }
  };

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("leadflow_theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <NavContext.Provider
      value={{
        activeTab,
        setActiveTab,
        role,
        setRole,
        leadsCount,
        setLeadsCount,
        theme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const context = useContext(NavContext);
  if (!context) {
    throw new Error("useNav must be used within a NavProvider");
  }
  return context;
}
