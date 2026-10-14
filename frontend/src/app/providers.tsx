"use client";

import React from "react";
import { AuthProvider } from "@/lib/auth-context";
import { NavProvider } from "@/lib/nav-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavProvider>{children}</NavProvider>
    </AuthProvider>
  );
}
