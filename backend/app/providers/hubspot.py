import logging
import time
from typing import Any, Dict, List, Literal, Optional, Tuple
import httpx

from backend.app.core.config import settings
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)

HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize"
HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token"
HUBSPOT_TOKEN_INFO_URL = "https://api.hubapi.com/oauth/v1/access-tokens"
HUBSPOT_CRM_BASE_URL = "https://api.hubapi.com/crm/v3/objects"

HUBSPOT_SCOPES = [
    "oauth",
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.companies.read",
    "crm.objects.companies.write",
]


class HubSpotProvider(BaseProvider):
    """
    Production-ready HubSpot OAuth and CRM Synchronization Provider.
    Supports secure OAuth 2.0 authorization-code flow, token refresh,
    tenant-specific credential usage, company/contact creation & association,
    and mock/live/disabled execution modes.
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        redirect_uri: Optional[str] = None,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 15.0,
    ):
        provider_mode = mode or settings.PROVIDER_HUBSPOT_MODE
        super().__init__(
            key="hubspot",
            name="HubSpot CRM Integration",
            mode=provider_mode,
        )
        self.client_id = client_id or settings.HUBSPOT_CLIENT_ID
        self.client_secret = client_secret or settings.HUBSPOT_CLIENT_SECRET
        self.redirect_uri = redirect_uri or settings.HUBSPOT_REDIRECT_URI
        self.timeout_seconds = timeout_seconds

    def build_authorization_url(self, state: str) -> str:
        """
        Builds the HubSpot OAuth authorization URL with required scopes and CSRF state token.
        """
        if not self.client_id:
            raise ValueError("HUBSPOT_CLIENT_ID is not configured in environment settings.")
        if not self.redirect_uri:
            raise ValueError("HUBSPOT_REDIRECT_URI is not configured in environment settings.")

        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(HUBSPOT_SCOPES),
            "state": state,
        }
        import urllib.parse
        query_string = urllib.parse.urlencode(params)
        return f"{HUBSPOT_AUTH_URL}?{query_string}"

    async def exchange_code_for_tokens(self, code: str) -> Dict[str, Any]:
        """
        Exchanges temporary OAuth authorization code for access and refresh tokens.
        """
        if self.mode == "mock":
            return {
                "access_token": f"mock_hubspot_access_{int(time.time())}",
                "refresh_token": f"mock_hubspot_refresh_{int(time.time())}",
                "expires_in": 1800,
                "expires_at": int(time.time()) + 1800,
                "token_type": "bearer",
                "portal_id": "mock_portal_12345",
            }

        if not self.client_id or not self.client_secret:
            raise ValueError("HubSpot Client ID or Client Secret not configured.")

        data = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "code": code,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            resp = await client.post(
                HUBSPOT_TOKEN_URL,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code != 200:
            err_msg = resp.text
            try:
                err_json = resp.json()
                err_msg = err_json.get("message", err_msg)
            except Exception:
                pass
            logger.error(f"HubSpot token exchange failed ({resp.status_code}): {err_msg}")
            raise ValueError(f"HubSpot OAuth token exchange failed: {err_msg}")

        token_data = resp.json()
        expires_in = int(token_data.get("expires_in", 1800))
        token_data["expires_at"] = int(time.time()) + expires_in

        # Retrieve portal ID (hub_id) using token info endpoint
        access_token = token_data.get("access_token")
        if access_token:
            try:
                info = await self.get_token_info(access_token)
                token_data["portal_id"] = str(info.get("hub_id", ""))
                token_data["hub_domain"] = info.get("hub_domain")
                token_data["user"] = info.get("user")
            except Exception as e:
                logger.warning(f"Failed to fetch HubSpot token info: {e}")

        return token_data

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refreshes an expired access token using the stored refresh token.
        """
        if self.mode == "mock":
            return {
                "access_token": f"mock_refreshed_access_{int(time.time())}",
                "refresh_token": refresh_token,
                "expires_in": 1800,
                "expires_at": int(time.time()) + 1800,
                "token_type": "bearer",
            }

        if not self.client_id or not self.client_secret:
            raise ValueError("HubSpot Client ID or Client Secret not configured.")

        data = {
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            resp = await client.post(
                HUBSPOT_TOKEN_URL,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code != 200:
            err_msg = resp.text
            try:
                err_json = resp.json()
                err_msg = err_json.get("message", err_msg)
            except Exception:
                pass
            logger.error(f"HubSpot token refresh failed ({resp.status_code}): {err_msg}")
            raise ValueError(f"HubSpot token refresh failed: {err_msg}")

        refreshed = resp.json()
        expires_in = int(refreshed.get("expires_in", 1800))
        refreshed["expires_at"] = int(time.time()) + expires_in
        # Preserve original refresh token if HubSpot didn't rotate it
        if "refresh_token" not in refreshed or not refreshed["refresh_token"]:
            refreshed["refresh_token"] = refresh_token

        return refreshed

    async def get_token_info(self, access_token: str) -> Dict[str, Any]:
        """
        Fetches metadata for an access token (portal hub_id, scopes, user).
        """
        if self.mode == "mock":
            return {
                "hub_id": "12345678",
                "hub_domain": "mock-leadflow.hubspot.com",
                "user": "demo@leadflow.local",
                "scopes": HUBSPOT_SCOPES,
            }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            resp = await client.get(
                f"{HUBSPOT_TOKEN_INFO_URL}/{access_token}",
                headers={"Authorization": f"Bearer {access_token}"},
            )

        if resp.status_code != 200:
            raise ValueError(f"Failed to inspect HubSpot token info: {resp.text}")

        return resp.json()

    async def ensure_valid_access_token(
        self, credentials: Dict[str, Any]
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Ensures the access token is valid and not expired.
        If expired or near expiration (< 60s), attempts refresh and returns updated credentials.
        Returns: (valid_access_token, updated_credentials_or_none)
        """
        access_token = credentials.get("access_token")
        refresh_token = credentials.get("refresh_token")
        expires_at = credentials.get("expires_at", 0)

        # Buffer: refresh 60 seconds before expiration
        now = int(time.time())
        if access_token and (expires_at - now > 60):
            return access_token, None

        if not refresh_token:
            if access_token:
                return access_token, None
            raise ValueError("No valid access token or refresh token available.")

        # Perform token refresh
        refreshed = await self.refresh_access_token(refresh_token)
        updated_creds = {**credentials, **refreshed}
        return refreshed["access_token"], updated_creds

    async def search_company_by_domain(self, domain: str, access_token: str) -> Optional[str]:
        """
        Searches HubSpot for an existing company matching the given domain.
        Returns the remote company ID or None.
        """
        clean_domain = domain.lower().replace("http://", "").replace("https://", "").split("/")[0].strip()
        search_payload = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "domain",
                            "operator": "EQ",
                            "value": clean_domain,
                        }
                    ]
                }
            ],
            "limit": 1,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            resp = await client.post(
                f"{HUBSPOT_CRM_BASE_URL}/companies/search",
                json=search_payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )

        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            if results and len(results) > 0:
                return str(results[0].get("id"))
        return None

    async def upsert_company(
        self,
        company_data: Dict[str, Any],
        access_token: str,
    ) -> str:
        """
        Creates or updates a company in HubSpot CRM.
        Returns remote company ID.
        """
        domain = company_data.get("domain", "").strip()
        name = company_data.get("name") or company_data.get("company_name") or domain

        existing_id = None
        if domain:
            existing_id = await self.search_company_by_domain(domain, access_token)

        props: Dict[str, Any] = {
            "name": name,
        }
        if domain:
            props["domain"] = domain
        if company_data.get("industry"):
            props["industry"] = company_data["industry"]
        if company_data.get("city") or company_data.get("location"):
            props["city"] = company_data.get("city") or company_data.get("location")
        if company_data.get("numberofemployees") or company_data.get("employee_count"):
            props["numberofemployees"] = str(company_data.get("numberofemployees") or company_data.get("employee_count"))

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            if existing_id:
                # Update existing company
                resp = await client.patch(
                    f"{HUBSPOT_CRM_BASE_URL}/companies/{existing_id}",
                    json={"properties": props},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if resp.status_code in (200, 201):
                    return existing_id
            else:
                # Create new company
                resp = await client.post(
                    f"{HUBSPOT_CRM_BASE_URL}/companies",
                    json={"properties": props},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if resp.status_code in (200, 201):
                    return str(resp.json().get("id"))

        raise ValueError(f"Failed to upsert company in HubSpot ({resp.status_code}): {resp.text}")

    async def search_contact_by_email(self, email: str, access_token: str) -> Optional[str]:
        """
        Searches HubSpot for an existing contact matching the given email.
        """
        clean_email = email.lower().strip()
        search_payload = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "email",
                            "operator": "EQ",
                            "value": clean_email,
                        }
                    ]
                }
            ],
            "limit": 1,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            resp = await client.post(
                f"{HUBSPOT_CRM_BASE_URL}/contacts/search",
                json=search_payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )

        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            if results and len(results) > 0:
                return str(results[0].get("id"))
        return None

    async def upsert_contact(
        self,
        contact_data: Dict[str, Any],
        access_token: str,
    ) -> str:
        """
        Creates or updates a contact in HubSpot CRM.
        Returns remote contact ID.
        """
        email = contact_data.get("email", "").strip()
        if not email:
            raise ValueError("Contact email is required to sync contact to HubSpot")

        existing_id = await self.search_contact_by_email(email, access_token)

        props: Dict[str, Any] = {
            "email": email,
        }
        if contact_data.get("firstname"):
            props["firstname"] = contact_data["firstname"]
        elif contact_data.get("full_name"):
            parts = contact_data["full_name"].strip().split(" ", 1)
            props["firstname"] = parts[0]
            if len(parts) > 1:
                props["lastname"] = parts[1]
        if contact_data.get("lastname"):
            props["lastname"] = contact_data["lastname"]
        if contact_data.get("jobtitle") or contact_data.get("title"):
            props["jobtitle"] = contact_data.get("jobtitle") or contact_data.get("title")
        if contact_data.get("company_name"):
            props["company"] = contact_data["company_name"]
        if contact_data.get("phone"):
            props["phone"] = contact_data["phone"]

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            if existing_id:
                resp = await client.patch(
                    f"{HUBSPOT_CRM_BASE_URL}/contacts/{existing_id}",
                    json={"properties": props},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if resp.status_code in (200, 201):
                    return existing_id
            else:
                resp = await client.post(
                    f"{HUBSPOT_CRM_BASE_URL}/contacts",
                    json={"properties": props},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if resp.status_code in (200, 201):
                    return str(resp.json().get("id"))

        raise ValueError(f"Failed to upsert contact in HubSpot ({resp.status_code}): {resp.text}")

    async def associate_contact_to_company(
        self,
        contact_id: str,
        company_id: str,
        access_token: str,
    ) -> bool:
        """
        Associates contact to company using HubSpot v3 associations endpoint.
        """
        url = f"{HUBSPOT_CRM_BASE_URL}/contacts/{contact_id}/associations/companies/{company_id}/contact_to_company"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            resp = await client.put(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        return resp.status_code in (200, 201, 204)

    async def sync_lead(
        self,
        company_data: Dict[str, Any],
        contact_data: Optional[Dict[str, Any]],
        credentials: Dict[str, Any],
        mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        High-level sync:
        1. Ensures valid access token (refreshes if needed).
        2. Upserts company in HubSpot.
        3. Upserts contact in HubSpot if provided.
        4. Associates contact to company if both exist.
        Returns dictionary with remote IDs and status.
        """
        effective_mode = mode or self.mode
        if effective_mode == "disabled":
            raise ValueError("HubSpot CRM integration is disabled.")

        if effective_mode == "mock":
            # Return deterministic mock payload without making external calls
            mock_ts = int(time.time())
            remote_comp_id = f"mock-comp-{mock_ts}"
            remote_contact_id = f"mock-contact-{mock_ts}" if contact_data else None
            return {
                "status": "synced",
                "mode": "mock",
                "remote_company_id": remote_comp_id,
                "remote_contact_id": remote_contact_id,
                "associated": bool(remote_contact_id),
                "refreshed_credentials": None,
                "response_payload": {
                    "company_id": remote_comp_id,
                    "contact_id": remote_contact_id,
                    "provider": "hubspot",
                    "mode": "mock",
                    "timestamp": mock_ts,
                },
            }

        # Live mode execution
        access_token, updated_creds = await self.ensure_valid_access_token(credentials)

        remote_company_id = await self.upsert_company(company_data, access_token)

        remote_contact_id = None
        associated = False
        if contact_data and contact_data.get("email"):
            remote_contact_id = await self.upsert_contact(contact_data, access_token)
            if remote_company_id and remote_contact_id:
                try:
                    associated = await self.associate_contact_to_company(
                        remote_contact_id, remote_company_id, access_token
                    )
                except Exception as e:
                    logger.warning(f"HubSpot contact association failed: {e}")

        return {
            "status": "synced",
            "mode": "live",
            "remote_company_id": remote_company_id,
            "remote_contact_id": remote_contact_id,
            "associated": associated,
            "refreshed_credentials": updated_creds,
            "response_payload": {
                "company_id": remote_company_id,
                "contact_id": remote_contact_id,
                "associated": associated,
                "provider": "hubspot",
                "mode": "live",
            },
        }

    async def execute(self, target: str, **kwargs: Any) -> ProviderResult:
        """
        Implementation of BaseProvider abstract method.
        Target can be domain or lead ID; kwargs can contain company_data, contact_data, credentials.
        """
        credentials = kwargs.get("credentials", {})
        company_data = kwargs.get("company_data", {"domain": target})
        contact_data = kwargs.get("contact_data")

        try:
            result = await self.sync_lead(
                company_data=company_data,
                contact_data=contact_data,
                credentials=credentials,
                mode=self.mode,
            )
            return ProviderResult(
                provider_key=self.key,
                status="success" if result["mode"] == "live" else "mock",
                data=result,
                quota_consumed=1,
            )
        except Exception as e:
            logger.error(f"HubSpot execution error: {e}")
            return ProviderResult(
                provider_key=self.key,
                status="error",
                error_message=str(e),
            )

    def get_quota_info(self) -> Dict[str, Any]:
        return {
            "free_quota": "Free Developer Test Account (100 req / 10s)",
            "rate_limit": "100 requests per 10 seconds",
            "mode": self.mode,
        }
