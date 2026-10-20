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
  is_superuser?: boolean;
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

export interface ForgotPasswordResult {
  message: string;
  has_security_question?: boolean;
  security_question?: string | null;
}

export async function apiForgotPassword(email: string): Promise<ForgotPasswordResult> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to request password reset." }));
    throw new Error(err.detail || "Failed to request password reset.");
  }
  return res.json();
}

export async function apiVerifyResetToken(token: string): Promise<{ valid: boolean; email?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/auth/verify-reset-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    return { valid: false, message: "Network or server error verifying token." };
  }
  return res.json();
}

export async function apiResetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to reset password." }));
    throw new Error(err.detail || "Failed to reset password.");
  }
  return res.json();
}

export async function apiSecurityQuestionRecover(payload: { email: string; security_answer: string; new_password: string }): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/auth/security-question-recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Security recovery failed." }));
    throw new Error(err.detail || "Incorrect security question answer.");
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

// -----------------------------------------------------------------------------
// ICP Audiences & Filter Catalog API (Section 8)
// -----------------------------------------------------------------------------

export interface AudienceFilters {
  verticals: string[];
  vertical_match: "or" | "and";
  locations: string[];
  location_match: "or" | "and";
  headcount_ranges: string[];
  exclude_locations: string[];
  exclude_verticals: string[];
  exclude_domains: string[];
  exclude_existing_crm: boolean;
  negative_keywords: string[];
}

export interface AudienceItem {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  filters: AudienceFilters;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FilterCatalogResponse {
  verticals: string[];
  locations: string[];
  headcount_ranges: string[];
  match_operators: string[];
}

export interface AIProposeResponse {
  filters: AudienceFilters;
  rationale: string;
  estimated_pool_depth: string;
  suggested_name: string;
}

export async function fetchFilterCatalog(): Promise<FilterCatalogResponse> {
  const res = await authenticatedFetch(`${API_BASE}/audiences/filter-catalog`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch filter catalog");
  }
  return res.json();
}

export async function fetchAudiences(): Promise<AudienceItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/audiences`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch ICP audiences");
  }
  return res.json();
}

export async function createAudience(data: {
  name: string;
  description?: string;
  filters: AudienceFilters;
  is_default?: boolean;
}): Promise<AudienceItem> {
  const res = await authenticatedFetch(`${API_BASE}/audiences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create audience" }));
    throw new Error(err.detail || "Failed to create audience");
  }
  return res.json();
}

export async function updateAudience(
  audienceId: string,
  data: {
    name?: string;
    description?: string;
    filters?: AudienceFilters;
    is_default?: boolean;
  }
): Promise<AudienceItem> {
  const res = await authenticatedFetch(`${API_BASE}/audiences/${audienceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to update audience" }));
    throw new Error(err.detail || "Failed to update audience");
  }
  return res.json();
}

export async function aiProposeIcp(briefText: string): Promise<AIProposeResponse> {
  const res = await authenticatedFetch(`${API_BASE}/audiences/ai-propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief_text: briefText }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to propose ICP filters" }));
    throw new Error(err.detail || "Failed to propose ICP filters");
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// Super Admin & Platform Audit Trail API (Section 4 & 17)
// -----------------------------------------------------------------------------

export interface AdminOrgItem {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  operator_enabled: boolean;
  monthly_lead_quota: number;
  user_count: number;
  lead_count: number;
  created_at?: string;
}

export interface AuditLogItem {
  id: string;
  org_id: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details: Record<string, any>;
  ip_address?: string | null;
  created_at: string;
}

export async function fetchAdminOrgs(): Promise<AdminOrgItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/admin/orgs`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch admin orgs" }));
    throw new Error(err.detail || "Failed to fetch admin organizations");
  }
  return res.json();
}

export async function updateAdminOrg(
  orgId: string,
  data: {
    name?: string;
    is_active?: boolean;
    operator_enabled?: boolean;
    monthly_lead_quota?: number;
  }
): Promise<AdminOrgItem> {
  const res = await authenticatedFetch(`${API_BASE}/admin/orgs/${orgId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to update organization" }));
    throw new Error(err.detail || "Failed to update organization");
  }
  return res.json();
}

export async function fetchAuditLogs(orgId?: string, limit: number = 50): Promise<AuditLogItem[]> {
  const url = orgId
    ? `${API_BASE}/admin/audit-logs?org_id=${encodeURIComponent(orgId)}&limit=${limit}`
    : `${API_BASE}/admin/audit-logs?limit=${limit}`;
  const res = await authenticatedFetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch audit logs");
  }
  return res.json();
}

export interface OrgAdminUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active?: boolean;
  created_at?: string;
}

export async function fetchOrgAdmins(orgId: string): Promise<OrgAdminUser[]> {
  const res = await authenticatedFetch(`${API_BASE}/admin/orgs/${orgId}/admins`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch organization administrators" }));
    throw new Error(err.detail || "Failed to fetch organization administrators");
  }
  return res.json();
}

export async function fetchOrgMembersForAdmin(orgId: string): Promise<OrgAdminUser[]> {
  const res = await authenticatedFetch(`${API_BASE}/admin/orgs/${orgId}/members`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch organization members" }));
    throw new Error(err.detail || "Failed to fetch organization members");
  }
  return res.json();
}

export async function assignOrgAdmin(orgId: string, email: string): Promise<OrgAdminUser> {
  const res = await authenticatedFetch(`${API_BASE}/admin/orgs/${orgId}/admins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to assign administrator" }));
    throw new Error(err.detail || "Failed to assign administrator");
  }
  return res.json();
}

export async function removeOrgAdmin(orgId: string, userId: string): Promise<{ message: string; user_id: string; new_role: string }> {
  const res = await authenticatedFetch(`${API_BASE}/admin/orgs/${orgId}/admins/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to remove administrator" }));
    throw new Error(err.detail || "Failed to remove administrator");
  }
  return res.json();
}

export async function fetchOrgMembers(orgId: string): Promise<OrgAdminUser[]> {
  const res = await authenticatedFetch(`${API_BASE}/orgs/${orgId}/members`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch organization members" }));
    throw new Error(err.detail || "Failed to fetch organization members");
  }
  return res.json();
}

export async function transferOrgAdmin(
  orgId: string,
  target: { target_user_id?: string; target_email?: string }
): Promise<{ message: string; target_user_id: string; target_email: string; target_role: string; previous_admin_role: string }> {
  const res = await authenticatedFetch(`${API_BASE}/orgs/${orgId}/transfer-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to transfer administration" }));
    throw new Error(err.detail || "Failed to transfer administration");
  }
  return res.json();
}

export async function apiCreateOrg(name: string): Promise<{ id: string; name: string; slug: string; role: string }> {
  const res = await authenticatedFetch(`${API_BASE}/orgs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create organization" }));
    throw new Error(err.detail || "Failed to create organization");
  }
  return res.json();
}

// ==============================================================================
// In-App Persistent Notifications API
// ==============================================================================

export interface NotificationItem {
  id: string;
  recipient_id: string;
  org_id?: string | null;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  metadata_json: Record<string, any>;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export async function fetchNotifications(limit: number = 30): Promise<NotificationListResponse> {
  const res = await authenticatedFetch(`${API_BASE}/notifications?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) {
    return { items: [], unread_count: 0 };
  }
  return res.json();
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  const res = await authenticatedFetch(`${API_BASE}/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
  if (!res.ok) {
    throw new Error("Failed to mark notification as read");
  }
  return res.json();
}

export async function markAllNotificationsRead(): Promise<{ status: string; updated_count: number }> {
  const res = await authenticatedFetch(`${API_BASE}/notifications/read-all`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Failed to mark all notifications as read");
  }
  return res.json();
}

// ==============================================================================
// Organisation Access Requests API
// ==============================================================================

export interface AccessRequestItem {
  id: string;
  org_id: string;
  org_name: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  client_id?: string | null;
  note?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
}

export async function submitAccessRequest(data: { org_name: string; client_id?: string; note?: string }): Promise<AccessRequestItem> {
  const res = await authenticatedFetch(`${API_BASE}/orgs/access-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to submit access request" }));
    throw new Error(err.detail || "Failed to submit access request");
  }
  return res.json();
}

export async function fetchMyAccessRequests(): Promise<AccessRequestItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/orgs/access-requests/my`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchOrgAccessRequests(orgId: string): Promise<AccessRequestItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/orgs/access-requests/${orgId}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch organization access requests" }));
    throw new Error(err.detail || "Failed to fetch organization access requests");
  }
  return res.json();
}

export async function approveAccessRequest(orgId: string, requestId: string, role: string = "client_viewer"): Promise<AccessRequestItem> {
  const res = await authenticatedFetch(`${API_BASE}/orgs/access-requests/${orgId}/${requestId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to approve access request" }));
    throw new Error(err.detail || "Failed to approve access request");
  }
  return res.json();
}

export async function rejectAccessRequest(orgId: string, requestId: string, rejectionReason?: string): Promise<AccessRequestItem> {
  const res = await authenticatedFetch(`${API_BASE}/orgs/access-requests/${orgId}/${requestId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejection_reason: rejectionReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to reject access request" }));
    throw new Error(err.detail || "Failed to reject access request");
  }
  return res.json();
}

// ==============================================================================
// Workspace Creation Requests API
// ==============================================================================

export interface WorkspaceRequestItem {
  id: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  proposed_name: string;
  normalized_name: string;
  status: "pending" | "approved" | "rejected";
  created_org_id?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  duplicate_warning?: boolean;
  created_at: string;
}

export async function submitWorkspaceRequest(proposedName: string, intendedUse?: string): Promise<WorkspaceRequestItem> {
  const res = await authenticatedFetch(`${API_BASE}/workspaces/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposed_name: proposedName, intended_use: intendedUse }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to submit workspace request" }));
    throw new Error(err.detail || "Failed to submit workspace request");
  }
  return res.json();
}

export async function fetchMyWorkspaceRequests(): Promise<WorkspaceRequestItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/workspaces/requests/my`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchAdminWorkspaceRequests(): Promise<WorkspaceRequestItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/workspaces/requests/admin`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch workspace requests" }));
    throw new Error(err.detail || "Failed to fetch workspace requests");
  }
  return res.json();
}

export async function approveWorkspaceRequest(requestId: string): Promise<WorkspaceRequestItem> {
  const res = await authenticatedFetch(`${API_BASE}/workspaces/requests/admin/${requestId}/approve`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to approve workspace request" }));
    throw new Error(err.detail || "Failed to approve workspace request");
  }
  return res.json();
}

export async function rejectWorkspaceRequest(requestId: string, rejectionReason?: string): Promise<WorkspaceRequestItem> {
  const res = await authenticatedFetch(`${API_BASE}/workspaces/requests/admin/${requestId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejection_reason: rejectionReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to reject workspace request" }));
    throw new Error(err.detail || "Failed to reject workspace request");
  }
  return res.json();
}

export async function registerAndRequestAccess(data: {
  full_name: string;
  email: string;
  password: string;
  org_name: string;
  client_id?: string;
  note?: string;
}): Promise<AccessRequestItem> {
  const res = await fetch(`${API_BASE}/orgs/access-requests/register-and-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to submit access request" }));
    throw new Error(err.detail || "Failed to submit access request");
  }
  return res.json();
}

export async function registerAndRequestWorkspace(data: {
  full_name: string;
  email: string;
  password: string;
  org_name: string;
  intended_use?: string;
}): Promise<WorkspaceRequestItem> {
  const res = await fetch(`${API_BASE}/workspaces/requests/register-and-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to submit workspace request" }));
    throw new Error(err.detail || "Failed to submit workspace request");
  }
  return res.json();
}

export async function createAdminOrg(data: {
  name: string;
  admin_email: string;
  admin_full_name?: string;
  monthly_lead_quota?: number;
}): Promise<AdminOrgItem> {
  const res = await authenticatedFetch(`${API_BASE}/admin/orgs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create organisation" }));
    throw new Error(err.detail || "Failed to create organisation");
  }
  return res.json();
}

export interface DiscoveredCompany {
  company_name: string;
  domain: string;
  location: string;
  industry: string;
  employee_count: string;
  emails_count: number;
  sample_email?: string;
  source: string;
}

export interface AudienceDiscoverResponse {
  query_used: string;
  limit_requested: number;
  total_found: number;
  companies: DiscoveredCompany[];
}

export async function discoverCompaniesForIcp(data: {
  audience_id?: string;
  filters?: AudienceFilters;
  limit: number;
  query_override?: string;
}): Promise<AudienceDiscoverResponse> {
  const res = await authenticatedFetch(`${API_BASE}/audiences/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to discover companies matching ICP" }));
    throw new Error(err.detail || "Failed to discover companies matching ICP");
  }
  return res.json();
}

export interface MoveToPipelineResponse {
  lead_id: string;
  org_id: string;
  company_name: string;
  domain: string;
  industry?: string;
  location?: string;
  employee_count?: string;
  pipeline_state: string;
  contact_email?: string;
  is_new: boolean;
  message: string;
}

export async function moveCompanyToPipeline(data: {
  company_name: string;
  domain: string;
  industry?: string;
  location?: string;
  employee_count?: string;
  contact_email?: string;
  contact_name?: string;
  pipeline_state?: string;
}): Promise<MoveToPipelineResponse> {
  const res = await authenticatedFetch(`${API_BASE}/audiences/move-to-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to move company to pipeline" }));
    throw new Error(err.detail || "Failed to move company to pipeline");
  }
  return res.json();
}

export interface SendOutreachResponse {
  lead_id: string;
  delivered: boolean;
  recipient: string;
  subject: string;
  provider: string;
  provider_message_id?: string;
  pipeline_state: string;
  message: string;
}

export async function sendLeadOutreach(
  leadId: string,
  data: {
    to_email: string;
    subject: string;
    body: string;
    tone?: string;
  }
): Promise<SendOutreachResponse> {
  const res = await authenticatedFetch(`${API_BASE}/leads/${leadId}/send-outreach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to dispatch email via Resend" }));
    throw new Error(err.detail || "Failed to dispatch email via Resend");
  }
  return res.json();
}

export async function scoreLeadApi(leadId: string): Promise<any> {
  const res = await authenticatedFetch(`${API_BASE}/leads/${leadId}/score`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to evaluate 22 signals for lead" }));
    throw new Error(err.detail || "Failed to evaluate 22 signals for lead");
  }
  return res.json();
}

export interface LeadContactSummary {
  name: string;
  title?: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  revealed: boolean;
}

export interface LeadOutItem {
  id: string;
  org_id: string;
  company_name: string;
  domain: string;
  industry?: string;
  location?: string;
  employee_count?: string;
  pipeline_state: "sourced" | "review" | "qualified" | "approved" | "drafted" | "synced" | "rejected" | "disqualified";
  score_band?: "qualified" | "review" | "disqualified";
  latest_score?: number;
  contact?: LeadContactSummary;
  latest_enrichment?: {
    id: string;
    provider: string;
    status: string;
    crawled_url: string;
    observed_at?: string;
    evidence: any;
  };
  latest_score_record?: any;
  draft?: {
    subject: string;
    body: string;
    tone?: string;
    model?: string;
    cost_usd?: number;
    approved?: boolean;
  };
  created_at?: string;
}

export interface PaginatedLeadsResponse {
  items: LeadOutItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export async function fetchLeads(params?: {
  page?: number;
  page_size?: number;
  state?: string;
  search?: string;
}): Promise<PaginatedLeadsResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", params.page.toString());
  query.set("page_size", (params?.page_size || 100).toString());
  if (params?.state && params.state !== "all") query.set("state", params.state);
  if (params?.search) query.set("search", params.search);

  const res = await authenticatedFetch(`${API_BASE}/leads?${query.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch leads");
  }
  return res.json();
}

export async function updateLead(
  leadId: string,
  data: { pipeline_state?: string; company_name?: string; draft?: any }
): Promise<LeadOutItem> {
  const res = await authenticatedFetch(`${API_BASE}/leads/${leadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to update lead" }));
    throw new Error(err.detail || "Failed to update lead");
  }
  return res.json();
}

export async function crawlLeadApi(leadId: string): Promise<any> {
  const res = await authenticatedFetch(`${API_BASE}/leads/${leadId}/crawl`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to audit lead website" }));
    throw new Error(err.detail || "Failed to audit lead website");
  }
  return res.json();
}

export async function uploadCsv(file: File): Promise<{
  search_id: string;
  filename: string;
  total_rows_parsed: number;
  imported_count: number;
  duplicate_count: number;
  file_duplicates: number;
  errors: any[];
}> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authenticatedFetch(`${API_BASE}/ingest/csv`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to upload CSV file" }));
    throw new Error(err.detail || "Failed to upload CSV file");
  }
  return res.json();
}

export async function seedStarterLeads(): Promise<LeadOutItem[]> {
  const res = await authenticatedFetch(`${API_BASE}/leads/seed-starter`, {
    method: "POST",
  });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export interface HubSpotStatusResponse {
  connected: boolean;
  status: "connected" | "disconnected" | "error";
  mode: "mock" | "live" | "disabled";
  portal_id?: string | null;
  hub_domain?: string | null;
  last_sync_at?: string | null;
  expires_at?: number | null;
}

export interface HubSpotAuthorizeResponse {
  authorization_url: string;
  state: string;
}

export interface HubSpotDisconnectResponse {
  success: boolean;
  message: string;
}

export interface FieldValidationItem {
  field: string;
  leadflow_value?: any;
  hubspot_property: string;
  hubspot_value?: any;
  status: "ready" | "mapped" | "omitted_warning" | "omitted" | "error";
  is_blocking: boolean;
  message: string;
}

export interface HubSpotPreviewResponse {
  lead_id: string;
  company_name: string;
  domain: string;
  operation: "create" | "update";
  existing_remote_company_id?: string | null;
  is_valid: boolean;
  has_blocking_errors: boolean;
  field_validations: FieldValidationItem[];
  warnings: string[];
  errors: string[];
}

export interface HubSpotSyncResponse {
  lead_id: string;
  pipeline_state: string;
  remote_company_id?: string | null;
  remote_contact_id?: string | null;
  company_status?: string;
  contact_status?: string;
  sync_status: string;
  message: string;
  warnings?: string[];
  field_validations?: FieldValidationItem[];
  correlation_id?: string | null;
}

export interface HubSpotSyncHistoryItem {
  id: string;
  lead_id: string;
  company_name?: string | null;
  domain?: string | null;
  provider: string;
  remote_company_id?: string | null;
  remote_contact_id?: string | null;
  sync_status: string;
  created_at: string;
  initiated_by_user?: string | null;
  company_status?: string | null;
  contact_status?: string | null;
  warnings: string[];
  omitted_fields: string[];
  error_message?: string | null;
  correlation_id?: string | null;
  retry_eligible: boolean;
  retry_reason?: string | null;
}

export interface HubSpotSyncHistoryResponse {
  items: HubSpotSyncHistoryItem[];
  total: number;
}

export async function fetchHubSpotStatus(): Promise<HubSpotStatusResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations/hubspot/status`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch HubSpot connection status");
  }
  return res.json();
}

export async function getHubSpotAuthorizeUrl(): Promise<HubSpotAuthorizeResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations/hubspot/authorize`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to generate HubSpot authorization URL" }));
    throw new Error(err.detail || "Failed to generate HubSpot authorization URL");
  }
  return res.json();
}

export async function disconnectHubSpot(): Promise<HubSpotDisconnectResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations/hubspot/disconnect`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to disconnect HubSpot" }));
    throw new Error(err.detail || "Failed to disconnect HubSpot");
  }
  return res.json();
}

export async function fetchHubSpotSyncPreview(leadId: string): Promise<HubSpotPreviewResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations/hubspot/preview/${leadId}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to generate HubSpot sync preview" }));
    throw new Error(err.detail || "Failed to generate HubSpot sync preview");
  }
  return res.json();
}

export async function fetchHubSpotSyncHistory(limit: number = 20, offset: number = 0): Promise<HubSpotSyncHistoryResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations/hubspot/history?limit=${limit}&offset=${offset}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch HubSpot sync history");
  }
  return res.json();
}

export async function syncLeadToHubSpot(leadId: string): Promise<HubSpotSyncResponse> {
  const res = await authenticatedFetch(`${API_BASE}/settings/integrations/hubspot/sync/${leadId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to sync lead to HubSpot CRM" }));
    throw new Error(err.detail || "Failed to sync lead to HubSpot CRM");
  }
  return res.json();
}






