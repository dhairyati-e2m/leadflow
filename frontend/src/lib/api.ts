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

let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("leadflow_token", token);
    } else {
      localStorage.removeItem("leadflow_token");
    }
  }
}

export function getAuthToken(): string | null {
  if (_authToken) return _authToken;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("leadflow_token");
    if (stored) {
      _authToken = stored;
      return stored;
    }
  }
  return null;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers,
  });
}

export interface UserMembership {
  org_id: string;
  org_name: string;
  org_slug: string;
  role: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  memberships: UserMembership[];
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
  org_id: string;
  role: string;
}

export async function apiLogin(credentials: { email: string; password: string; org_id?: string }): Promise<AuthTokenResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Invalid email or password.");
  }
  const data: AuthTokenResponse = await res.json();
  setAuthToken(data.access_token);
  if (typeof window !== "undefined") {
    localStorage.setItem("leadflow_refresh_token", data.refresh_token);
    localStorage.setItem("leadflow_active_org", data.org_id);
  }
  return data;
}

export async function apiRegister(payload: { email: string; password: string; full_name: string; org_name: string }): Promise<AuthTokenResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || "Registration failed.");
  }
  const data: AuthTokenResponse = await res.json();
  setAuthToken(data.access_token);
  if (typeof window !== "undefined") {
    localStorage.setItem("leadflow_refresh_token", data.refresh_token);
    localStorage.setItem("leadflow_active_org", data.org_id);
  }
  return data;
}

export async function apiRefreshToken(refreshToken: string, orgId?: string): Promise<AuthTokenResponse> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken, org_id: orgId }),
  });
  if (!res.ok) {
    setAuthToken(null);
    throw new Error("Session expired. Please sign in again.");
  }
  const data: AuthTokenResponse = await res.json();
  setAuthToken(data.access_token);
  if (typeof window !== "undefined") {
    localStorage.setItem("leadflow_refresh_token", data.refresh_token);
    localStorage.setItem("leadflow_active_org", data.org_id);
  }
  return data;
}

export async function apiLogout(): Promise<void> {
  const refreshToken = typeof window !== "undefined" ? localStorage.getItem("leadflow_refresh_token") : null;
  try {
    await authenticatedFetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    // Continue cleanup even if server is offline
  } finally {
    setAuthToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("leadflow_refresh_token");
      localStorage.removeItem("leadflow_active_org");
    }
  }
}

export async function apiGetMe(): Promise<UserProfile> {
  const res = await authenticatedFetch(`${API_BASE}/auth/me`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load user profile");
  }
  return res.json();
}

export async function createBatchRun(
  leadIds?: string[],
  syncExecution: boolean = false
): Promise<BatchRunResponse> {
  const res = await authenticatedFetch(`${API_BASE}/jobs/runs`, {
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
  const res = await authenticatedFetch(`${API_BASE}/jobs/runs/${runId}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch run status: ${res.statusText}`);
  }
  return res.json();
}

export async function cancelRun(runId: string): Promise<BatchRunResponse> {
  const res = await authenticatedFetch(`${API_BASE}/jobs/runs/${runId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to cancel run: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchUsageLedger(): Promise<UsageLedgerResponse> {
  const res = await authenticatedFetch(`${API_BASE}/jobs/usage`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch usage ledger: ${res.statusText}`);
  }
  return res.json();
}

export interface ProviderControlItem {
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  mode: string;
  free_quota_description: string;
  is_configured: boolean;
  status_label: string;
}

export interface IntegrationSettingsResponse {
  master_switch_enabled: boolean;
  providers: ProviderControlItem[];
}

export async function fetchIntegrationSettings(): Promise<IntegrationSettingsResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch integrations: ${res.statusText}`);
  }
  return res.json();
}

export async function updateIntegrationSettings(payload: {
  master_switch_enabled?: boolean;
  provider_toggles?: Record<string, boolean>;
}): Promise<IntegrationSettingsResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to update integrations" }));
    throw new Error(err.detail || "Failed to update settings");
  }
  return res.json();
}
