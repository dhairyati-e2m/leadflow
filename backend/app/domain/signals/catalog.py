from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Literal


class SignalCategory(str, Enum):
    WEBSITE = "website"
    MARKETING = "marketing"


@dataclass(frozen=True)
class SignalDefinition:
    key: str
    category: SignalCategory
    name: str
    description: str
    default_weight: float


# Stable 22-Signal Catalog specification
SIGNAL_CATALOG: Dict[str, SignalDefinition] = {
    # ---------------- Website Signals (1 - 10) ----------------
    "legacy_platform": SignalDefinition(
        key="legacy_platform",
        category=SignalCategory.WEBSITE,
        name="Legacy Platform",
        description="Detects potentially outdated CMS, eCommerce, or web server technology",
        default_weight=1.0,
    ),
    "slow_site": SignalDefinition(
        key="slow_site",
        category=SignalCategory.WEBSITE,
        name="Slow Site",
        description="Assesses performance and page load duration from measured timings",
        default_weight=1.2,
    ),
    "old_design": SignalDefinition(
        key="old_design",
        category=SignalCategory.WEBSITE,
        name="Old Design",
        description="Assesses visual and DOM structure modernization opportunities",
        default_weight=0.8,
    ),
    "weak_ctas": SignalDefinition(
        key="weak_ctas",
        category=SignalCategory.WEBSITE,
        name="Weak CTAs",
        description="Detects missing or sparse conversion calls to action and lead forms",
        default_weight=1.2,
    ),
    "not_mobile_friendly": SignalDefinition(
        key="not_mobile_friendly",
        category=SignalCategory.WEBSITE,
        name="Not Mobile Friendly",
        description="Assesses responsive viewport tags and mobile styling cues",
        default_weight=1.5,
    ),
    "no_ssl": SignalDefinition(
        key="no_ssl",
        category=SignalCategory.WEBSITE,
        name="No SSL / HTTPS",
        description="Verifies HTTPS enforcement and valid SSL certificate",
        default_weight=1.5,
    ),
    "thin_content": SignalDefinition(
        key="thin_content",
        category=SignalCategory.WEBSITE,
        name="Thin Content",
        description="Measures meaningful body text volume, service details, and value proposition density",
        default_weight=1.0,
    ),
    "no_analytics": SignalDefinition(
        key="no_analytics",
        category=SignalCategory.WEBSITE,
        name="No Modern Analytics",
        description="Detects presence of tracking/analytics tags (GA4, GTM, Plausible, PostHog, etc.)",
        default_weight=0.8,
    ),
    "accessibility": SignalDefinition(
        key="accessibility",
        category=SignalCategory.WEBSITE,
        name="Accessibility Issues",
        description="Identifies automated WCAG accessibility issues (missing alt tags, aria attributes)",
        default_weight=0.8,
    ),
    "no_live_chat": SignalDefinition(
        key="no_live_chat",
        category=SignalCategory.WEBSITE,
        name="No Live Chat / Conversion Widget",
        description="Detects presence of live chat or modern conversational conversion widgets",
        default_weight=0.7,
    ),

    # ---------------- Marketing Signals (11 - 22) ----------------
    "poor_seo": SignalDefinition(
        key="poor_seo",
        category=SignalCategory.MARKETING,
        name="Poor SEO Fundamentals",
        description="Assesses title tags, meta descriptions, canonical links, and H1 hierarchy",
        default_weight=1.2,
    ),
    "poor_aeo_geo": SignalDefinition(
        key="poor_aeo_geo",
        category=SignalCategory.MARKETING,
        name="Poor AEO / Schema Data",
        description="Assesses Schema.org structured data (JSON-LD) for answer engines and search graphs",
        default_weight=1.0,
    ),
    "low_domain_trust": SignalDefinition(
        key="low_domain_trust",
        category=SignalCategory.MARKETING,
        name="Low Domain Trust",
        description="Assesses observable domain maturity and public TLD risk factors",
        default_weight=0.8,
    ),
    "stale_blog": SignalDefinition(
        key="stale_blog",
        category=SignalCategory.MARKETING,
        name="Stale Blog / Content",
        description="Detects blog existence and publication freshness from recent dates",
        default_weight=0.9,
    ),
    "no_press": SignalDefinition(
        key="no_press",
        category=SignalCategory.MARKETING,
        name="No Press / Newsroom",
        description="Detects publicly available newsroom, press releases, or media coverage",
        default_weight=0.6,
    ),
    "no_case_studies": SignalDefinition(
        key="no_case_studies",
        category=SignalCategory.MARKETING,
        name="No Case Studies / Proof",
        description="Detects customer testimonials, client logos, and case study pages",
        default_weight=1.2,
    ),
    "no_video": SignalDefinition(
        key="no_video",
        category=SignalCategory.MARKETING,
        name="No Embedded Video",
        description="Detects explanatory or product video content (YouTube, Vimeo, HTML5 video)",
        default_weight=0.6,
    ),
    "weak_social": SignalDefinition(
        key="weak_social",
        category=SignalCategory.MARKETING,
        name="Weak Social Presence",
        description="Discovers official social media links (LinkedIn, Twitter/X, GitHub, YouTube)",
        default_weight=0.8,
    ),
    "weak_email_capture": SignalDefinition(
        key="weak_email_capture",
        category=SignalCategory.MARKETING,
        name="Weak Email Capture",
        description="Assesses newsletter opt-in forms, lead magnet captures, and subscription inputs",
        default_weight=1.0,
    ),
    "ppc_spend": SignalDefinition(
        key="ppc_spend",
        category=SignalCategory.MARKETING,
        name="Paid Ad Retargeting",
        description="Detects active ad tracking pixels (Google Ads, Meta Pixel, LinkedIn Insight Tag)",
        default_weight=0.9,
    ),
    "hiring": SignalDefinition(
        key="hiring",
        category=SignalCategory.MARKETING,
        name="Active Hiring",
        description="Detects careers page presence, job openings, or applicant tracking system integration",
        default_weight=1.1,
    ),
    "low_review_rating": SignalDefinition(
        key="low_review_rating",
        category=SignalCategory.MARKETING,
        name="Review Rating & Social Proof",
        description="Evaluates legitimate review scores where available; never fabricates ratings",
        default_weight=1.0,
    ),
}

WEBSITE_SIGNAL_KEYS: List[str] = [
    k for k, v in SIGNAL_CATALOG.items() if v.category == SignalCategory.WEBSITE
]

MARKETING_SIGNAL_KEYS: List[str] = [
    k for k, v in SIGNAL_CATALOG.items() if v.category == SignalCategory.MARKETING
]

ALL_SIGNAL_KEYS: List[str] = list(SIGNAL_CATALOG.keys())
