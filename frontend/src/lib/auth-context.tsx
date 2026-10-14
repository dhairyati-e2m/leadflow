"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  UserProfile,
  UserMembership,
  apiGetMe,
  apiLogin,
  apiLogout,
  apiRefreshToken,
  apiRegister,
  getAuthToken,
  setAuthToken,
} from "./api";

export interface LoginResult {
  profile: UserProfile;
  role: string;
  isSuperAdmin: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  activeMembership: UserMembership | null;
  isLoading: boolean;
  login: (email: string, password: string, orgId?: string) => Promise<LoginResult>;
  register: (email: string, password: string, fullName: string, orgName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const restoreSession = useCallback(async (initialMount = false) => {
    if (initialMount) setIsLoading(true);
    const token = getAuthToken();
    const storedOrg = typeof window !== "undefined" ? localStorage.getItem("leadflow_active_org") : null;
    if (storedOrg) setActiveOrgId(storedOrg);

    if (token) {
      try {
        const profile = await apiGetMe();
        setUser(profile);
        if (!storedOrg && profile.memberships.length > 0) {
          setActiveOrgId(profile.memberships[0].org_id);
        }
      } catch {
        // Access token might be expired or revoked; attempt refresh
        const refreshToken = typeof window !== "undefined" ? localStorage.getItem("leadflow_refresh_token") : null;
        if (refreshToken) {
          try {
            const rotated = await apiRefreshToken(refreshToken, storedOrg || undefined);
            setActiveOrgId(rotated.org_id);
            const profile = await apiGetMe();
            setUser(profile);
          } catch {
            setAuthToken(null);
            setUser(null);
          }
        } else {
          setAuthToken(null);
          setUser(null);
        }
      }
    } else {
      setUser(null);
    }
    if (initialMount) setIsLoading(false);
  }, []);

  // Restore session on initial browser mount + Cross-device sync on tab focus/visibility
  useEffect(() => {
    restoreSession(true);

    const handleFocus = () => {
      restoreSession(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        restoreSession(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [restoreSession]);

  const refreshProfile = async () => {
    await restoreSession(false);
  };

  const login = async (email: string, password: string, orgId?: string): Promise<LoginResult> => {
    const res = await apiLogin({ email, password, org_id: orgId });
    setActiveOrgId(res.org_id);
    const profile = await apiGetMe();
    setUser(profile);

    const isSuperAdmin = Boolean(profile.is_superuser);
    const activeMem = profile.memberships.find((m) => m.org_id === res.org_id) || profile.memberships[0];
    const role = res.role || activeMem?.role || "analyst";

    return { profile, role, isSuperAdmin };
  };

  const register = async (email: string, password: string, fullName: string, orgName: string) => {
    const res = await apiRegister({ email, password, full_name: fullName, org_name: orgName });
    setActiveOrgId(res.org_id);
    const profile = await apiGetMe();
    setUser(profile);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setActiveOrgId(null);
  };

  const switchOrganization = async (orgId: string) => {
    const refreshToken = typeof window !== "undefined" ? localStorage.getItem("leadflow_refresh_token") : null;
    if (!refreshToken) return;
    const rotated = await apiRefreshToken(refreshToken, orgId);
    setActiveOrgId(rotated.org_id);
    const profile = await apiGetMe();
    setUser(profile);
  };

  const activeMembership =
    user?.memberships.find((m) => m.org_id === activeOrgId) ||
    user?.memberships[0] ||
    null;

  return (
    <AuthContext.Provider
      value={{
        user,
        activeMembership,
        isLoading,
        login,
        register,
        logout,
        switchOrganization,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
