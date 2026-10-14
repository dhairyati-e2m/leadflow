"use client";

import React from "react";
import { useAuth } from "@/lib/auth-context";
import { ClientPortal } from "@/components/ClientPortal";
import { WelcomeLanding } from "@/components/WelcomeLanding";

export default function PortalPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="py-24 text-center text-obsidian/60 dark:text-cosmic-400 text-xs">
        <span className="inline-block animate-spin h-6 w-6 border-2 border-obsidian dark:border-white border-t-transparent rounded-full mb-3"></span>
        <div>Verifying workspace credentials...</div>
      </div>
    );
  }

  if (!user) {
    return <WelcomeLanding />;
  }

  return <ClientPortal />;
}
