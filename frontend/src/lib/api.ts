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

export interface BatchRunResponse {
  run_id: string;
  batch_name: string;
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  error_message?: string | null;
  created_at?: string;
}

export interface UsageLedgerResponse {
  period: string;
  pages_crawled: number;
  leads_scored: number;
  hubspot_synced: number;
  enrichments_called: number;
}

export async function createBatchRun(
  leadIds?: string[],
  syncExecution: boolean = false
): Promise<BatchRunResponse> {
  const res = await fetch(`${API_BASE}/jobs/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_ids: leadIds,
      sync_execution: syncExecution,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create batch run: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchRunStatus(runId: string): Promise<BatchRunResponse> {
  const res = await fetch(`${API_BASE}/jobs/runs/${runId}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch run status: ${res.statusText}`);
  }
  return res.json();
}

export async function cancelRun(runId: string): Promise<BatchRunResponse> {
  const res = await fetch(`${API_BASE}/jobs/runs/${runId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to cancel run: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchUsageLedger(): Promise<UsageLedgerResponse> {
  const res = await fetch(`${API_BASE}/jobs/usage`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch usage ledger: ${res.statusText}`);
  }
  return res.json();
}
