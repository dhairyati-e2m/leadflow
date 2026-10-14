"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { IcpEditor } from "@/components/IcpEditor";
import { WelcomeLanding } from "@/components/WelcomeLanding";

export default function IcpPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="py-24 text-center text-obsidian/60 dark:text-cosmic-400 text-xs">
        <span className="inline-block animate-spin h-6 w-6 border-2 border-obsidian dark:border-white border-t-transparent rounded-full mb-3"></span>
        <div>Verifying operator credentials...</div>
      </div>
    );
  }

  if (!user) {
    return <WelcomeLanding />;
  }

  const isClientViewer = user.memberships.length > 0 && user.memberships[0].role === "client_viewer";
  if (isClientViewer) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 glass-panel card-cosmic rounded-3xl text-center space-y-4 border border-rose-300 dark:border-rose-900">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold text-lg mx-auto">
          🔒
        </div>
        <h2 className="text-lg font-bold text-obsidian dark:text-cosmic-100">
          Org Admin Authorization Required
        </h2>
        <p className="text-xs text-obsidian/70 dark:text-cosmic-300 leading-relaxed">
          Client accounts have read-only pipeline access and cannot edit audience strategies or ICP criteria.
        </p>
        <Link href="/portal" className="btn-obsidian inline-block px-4 py-2 rounded-xl text-xs font-semibold">
          Go to Client Portal
        </Link>
      </div>
    );
  }

  return <IcpEditor />;
}
