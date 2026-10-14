"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type NavTab = "leads" | "integrations";
type ThemeMode = "light" | "dark";

interface NavContextType {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  leadsCount: number;
  setLeadsCount: (count: number) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const NavContext = createContext<NavContextType | undefined>(undefined);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<NavTab>("leads");
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
  }, []);

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
