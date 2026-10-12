export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/v1";

export interface HealthResponse {
  status: string;
  app: string;
  environment: string;
  timestamp: string;
  providers: {
    enrichment: "mock" | "live" | "disabled";
    pagespeed: "mock" | "live" | "disabled";
    hubspot: "mock" | "live" | "disabled";
    llm: "none" | "ollama" | "openai-compatible";
  };
}

export interface SignalCatalogItem {
  key: string;
  category: "website" | "marketing";
  name: string;
  description: string;
  default_weight: number;
}

export interface SignalCatalogResponse {
  total_signals: number;
  signals: SignalCatalogItem[];
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch health: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSignalCatalog(): Promise<SignalCatalogResponse> {
  const res = await fetch(`${API_BASE}/scoring/signals`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch signals: ${res.statusText}`);
  }
  return res.json();
}
