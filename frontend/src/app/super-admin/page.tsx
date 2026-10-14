"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { SuperAdminPortal } from "@/components/SuperAdminPortal";
import { WelcomeLanding } from "@/components/WelcomeLanding";

export default function SuperAdminPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="py-24 text-center text-obsidian/60 dark:text-cosmic-400 text-xs">
        <span className="inline-block animate-spin h-6 w-6 border-2 border-obsidian dark:border-white border-t-transparent rounded-full mb-3"></span>
        <div>Verifying Super Admin authorization...</div>
      </div>
    );
  }

  if (!user) {
    return <WelcomeLanding />;
  }

  // Check super_admin authorization
  const isSuperAdmin =
    Boolean(user.is_superuser) ||
    user.memberships.some((m) => m.role === "super_admin");

  if (!isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 glass-panel card-cosmic rounded-3xl text-center space-y-4 border border-rose-300 dark:border-rose-900">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold text-lg mx-auto">
          ⛔
        </div>
        <h2 className="text-lg font-bold text-obsidian dark:text-cosmic-100">
          Unauthorized Access
        </h2>
        <p className="text-xs text-obsidian/70 dark:text-cosmic-300 leading-relaxed">
          Super Admin permissions are strictly required to access cross-tenant system oversight and compliance logs.
        </p>
        <Link href="/" className="btn-obsidian inline-block px-4 py-2 rounded-xl text-xs font-semibold">
          Return to Workspace
        </Link>
      </div>
    );
  }

  return <SuperAdminPortal />;
}
