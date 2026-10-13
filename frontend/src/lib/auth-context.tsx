"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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

interface AuthContextType {
  user: UserProfile | null;
  activeMembership: UserMembership | null;
  isLoading: boolean;
  login: (email: string, password: string, orgId?: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, orgName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session on initial browser mount
  useEffect(() => {
    async function restoreSession() {
      const token = getAuthToken();
      const storedOrg = localStorage.getItem("leadflow_active_org");
      if (storedOrg) setActiveOrgId(storedOrg);

      if (token) {
        try {
          const profile = await apiGetMe();
          setUser(profile);
          if (!storedOrg && profile.memberships.length > 0) {
            setActiveOrgId(profile.memberships[0].org_id);
          }
        } catch {
          // Access token might be expired; attempt refresh token
          const refreshToken = localStorage.getItem("leadflow_refresh_token");
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
      }
      setIsLoading(false);
    }

    restoreSession();
  }, []);

  const login = async (email: string, password: string, orgId?: string) => {
    const res = await apiLogin({ email, password, org_id: orgId });
    setActiveOrgId(res.org_id);
    const profile = await apiGetMe();
    setUser(profile);
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
    const refreshToken = localStorage.getItem("leadflow_refresh_token");
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
