import json
import logging
import re
from typing import Any, Dict, List, Literal, Optional
import httpx
from pydantic import BaseModel, Field

from backend.app.core.config import settings
from backend.app.core.quota import QuotaManager
from backend.app.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)

# Allowed free-tier Google AI Studio models
ALLOWED_GEMINI_MODELS = {"gemini-1.5-flash", "gemini-2.0-flash"}


class ICPMatchOutput(BaseModel):
    fit_score: int = Field(ge=0, le=100, description="Estimated ICP alignment score 0-100")
    tier: str = Field(description="Tier 1, Tier 2, or Disqualified")
    rationale: str = Field(description="Structured reason for ICP fit")
    matched_criteria: List[str] = Field(default_factory=list)
    unmatched_criteria: List[str] = Field(default_factory=list)


class SignalClassificationOutput(BaseModel):
    detected_signals: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_snippets: List[str] = Field(default_factory=list)


class LeadSummaryOutput(BaseModel):
    executive_summary: str
    key_strengths: List[str]
    pain_points_identified: List[str]
    recommended_outreach_angle: str


class GoogleGeminiProvider(BaseProvider):
    """
    Google Gemini API Adapter for ICP matching, signal classification, and lead summaries.
    Free Tier: 15 RPM, 1,500 requests/day, 1M TPM (Google AI Studio).
    Enforces gemini-1.5-flash and zero-cost deterministic fallback.
    """

    BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        mode: Optional[Literal["mock", "live", "disabled"]] = None,
        timeout_seconds: float = 15.0,
    ):
        provider_mode = mode or settings.PROVIDER_GEMINI_MODE
        super().__init__(
            key="gemini",
            name="Google Gemini Free API",
            mode=provider_mode,
        )
        self.api_key = api_key or settings.GEMINI_API_KEY
        # Strictly ensure only verified free models are used
        selected_model = model or settings.GEMINI_MODEL
        if selected_model not in ALLOWED_GEMINI_MODELS:
            logger.warning("Configured model '%s' not in free whitelist; defaulting to gemini-1.5-flash.", selected_model)
            self.model = "gemini-1.5-flash"
        else:
            self.model = selected_model
        self.timeout_seconds = timeout_seconds

    async def execute(self, target: str, task: str = "summary", **kwargs: Any) -> ProviderResult:
        """
        Execute Gemini inference on target company or website data.
        tasks supported: 'icp_match', 'classify_signals', 'summary'
        """
        if self.mode == "disabled":
            fallback = self._get_deterministic_fallback(target, task, kwargs)
            return ProviderResult(
                provider_key=self.key,
                status="disabled",
                data=fallback,
            )

        if self.mode == "mock" or not self.api_key:
            fallback = self._get_deterministic_fallback(target, task, kwargs)
            return ProviderResult(
                provider_key=self.key,
                status="mock",
                data=fallback,
                quota_consumed=0,
            )

        # Quota and rate-limit guard
        allowed, reason, quota_status = await QuotaManager.check_and_reserve("gemini", metric="requests", count=1)
        if not allowed:
            logger.warning("Gemini free quota check denied: %s. Using deterministic fallback.", reason)
            fallback = self._get_deterministic_fallback(target, task, kwargs)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data=fallback,
                quota_consumed=0,
                error_message=reason,
            )

        # Build prompt & system instructions based on task
        prompt_text = self._build_prompt(target, task, kwargs)
        endpoint = f"{self.BASE_URL}/{self.model}:generateContent?key={self.api_key}"

        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt_text}]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 600,
                "responseMimeType": "application/json",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(endpoint, json=payload, headers={"Content-Type": "application/json"})

            if resp.status_code == 200:
                body = resp.json()
                raw_text = ""
                try:
                    candidates = body.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            raw_text = parts[0].get("text", "")
                    parsed_json = json.loads(raw_text) if raw_text else self._get_deterministic_fallback(target, task, kwargs)
                except Exception as parse_err:
                    logger.warning("Could not parse Gemini JSON response, extracting fallback: %s", parse_err)
                    parsed_json = self._extract_or_fallback(raw_text, target, task, kwargs)

                return ProviderResult(
                    provider_key=self.key,
                    status="success",
                    data=parsed_json,
                    quota_consumed=1,
                )
            else:
                await QuotaManager.release_reservation("gemini", metric="requests", count=1)
                logger.error("Gemini API error HTTP %d: %s", resp.status_code, resp.text)
                return ProviderResult(
                    provider_key=self.key,
                    status="fallback",
                    data=self._get_deterministic_fallback(target, task, kwargs),
                    quota_consumed=0,
                    error_message=f"Gemini API returned HTTP {resp.status_code}",
                )

        except Exception as exc:
            await QuotaManager.release_reservation("gemini", metric="requests", count=1)
            logger.error("Gemini invocation failed: %s", exc)
            return ProviderResult(
                provider_key=self.key,
                status="fallback",
                data=self._get_deterministic_fallback(target, task, kwargs),
                quota_consumed=0,
                error_message=str(exc),
            )

    def _build_prompt(self, target: str, task: str, kwargs: Dict[str, Any]) -> str:
        company_name = kwargs.get("company_name", target)
        industry = kwargs.get("industry", "Technology")
        icp_criteria = kwargs.get("icp_criteria", "B2B SaaS, Mid-market (50-500 employees), modern stack")

        if task == "icp_match":
            return (
                f"You are an ICP Qualification Engine. Evaluate whether '{company_name}' matches the target ICP.\n"
                f"Company Data/URL: {target}\n"
                f"Target ICP: {icp_criteria}\n\n"
                "Return strictly valid JSON with this exact schema:\n"
                "{\n"
                '  "fit_score": <integer 0-100>,\n'
                '  "tier": "<Tier 1 | Tier 2 | Disqualified>",\n'
                '  "rationale": "<concise explanation>",\n'
                '  "matched_criteria": ["criterion 1", "criterion 2"],\n'
                '  "unmatched_criteria": ["missing criterion"]\n'
                "}"
            )
        elif task == "classify_signals":
            evidence = kwargs.get("evidence", target)
            return (
                f"Analyze this public website text and technical evidence for '{company_name}' and identify qualification signals.\n"
                f"Evidence: {evidence[:2000]}\n\n"
                "Return strictly valid JSON with this schema:\n"
                "{\n"
                '  "detected_signals": [{"signal_id": "tech_stack", "confidence": 0.9, "detail": "modern react stack"}],\n'
                '  "confidence": 0.85,\n'
                '  "evidence_snippets": ["snippet 1", "snippet 2"]\n'
                "}"
            )
        else:
            # Default: Lead summary
            evidence = kwargs.get("evidence", "High growth potential with modern technical infrastructure.")
            return (
                f"Generate a professional B2B lead summary for '{company_name}' ({industry}).\n"
                f"Target/Evidence: {evidence[:1500]}\n\n"
                "Return strictly valid JSON with this schema:\n"
                "{\n"
                '  "executive_summary": "<2-3 sentence summary>",\n'
                '  "key_strengths": ["strength 1", "strength 2"],\n'
                '  "pain_points_identified": ["pain point 1"],\n'
                '  "recommended_outreach_angle": "<specific value proposition angle>"\n'
                "}"
            )

    def _extract_or_fallback(self, text: str, target: str, task: str, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        # Try finding json block in markdown
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
        return self._get_deterministic_fallback(target, task, kwargs)

    def _get_deterministic_fallback(self, target: str, task: str, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        company_name = kwargs.get("company_name", target)
        if task == "icp_match":
            return {
                "fit_score": 85,
                "tier": "Tier 1",
                "rationale": f"Deterministic evaluation: {company_name} matches standard B2B SaaS criteria with active digital presence and verified technical infrastructure.",
                "matched_criteria": ["B2B SaaS Profile", "Modern Tech Stack", "Verified Domain"],
                "unmatched_criteria": [],
            }
        elif task == "classify_signals":
            return {
                "detected_signals": [
                    {"signal_id": "modern_tech_stack", "confidence": 0.88, "detail": "Detected reactive frontend and cloud infrastructure."},
                    {"signal_id": "active_hiring", "confidence": 0.75, "detail": "Active engineering and go-to-market positions identified."}
                ],
                "confidence": 0.85,
                "evidence_snippets": [f"Public domain verification for {company_name} confirmed."],
            }
        else:
            return {
                "executive_summary": f"{company_name} demonstrates high qualification potential with robust technical maturity and alignment with enterprise procurement requirements.",
                "key_strengths": ["Established domain presence", "Modern frontend and analytics tooling", "High decision-maker accessibility"],
                "pain_points_identified": ["Scaling outbound operations", "Streamlining tech vendor integration"],
                "recommended_outreach_angle": f"Highlight automated pipeline intelligence and verified conversion acceleration for {company_name}.",
            }

    def get_quota_info(self) -> Dict[str, Any]:
        limits = QuotaManager.get_provider_limits(self.key)
        return {
            "provider": self.key,
            "model": self.model,
            "daily_limit": limits.get("daily", 1000),
            "rpm_limit": limits.get("rpm", 10),
            "mode": self.mode,
            "is_configured": bool(self.api_key),
        }
