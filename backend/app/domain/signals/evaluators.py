from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from backend.app.domain.signals.catalog import (
    SIGNAL_CATALOG,
    SignalCategory,
)


class SignalResult(BaseModel):
    signal_key: str
    available: bool
    raw_value: Any = None
    normalized_score: float = 0.0  # 0.0 (low opportunity / satisfied) to 100.0 (high opportunity / strong issue)
    weight: float = 1.0
    evidence: Dict[str, Any] = Field(default_factory=dict)
    source: str = "crawler"
    confidence: float = 1.0  # 0.0 to 1.0
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    error_code: Optional[str] = None


class CrawlData(BaseModel):
    url: str
    status_code: int = 200
    headers: Dict[str, str] = Field(default_factory=dict)
    html: str = ""
    load_time_ms: Optional[float] = None
    ssl_valid: Optional[bool] = None
    external_data: Dict[str, Any] = Field(default_factory=dict)


def evaluate_legacy_platform(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "legacy_platform"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    generator_tag = soup.find("meta", attrs={"name": re.compile(r"^generator$", re.I)})
    generator = generator_tag.get("content", "").lower() if generator_tag else ""
    scripts = " ".join([s.get("src", "") for s in soup.find_all("script") if s.get("src")])
    headers_str = " ".join([f"{k}:{v}" for k, v in crawl.headers.items()]).lower()

    # Outdated indicators
    legacy_indicators = []
    if "wordpress 4." in generator or "wordpress 3." in generator:
        legacy_indicators.append(f"Outdated generator: {generator}")
    if "drupal 7" in generator or "drupal 6" in generator:
        legacy_indicators.append(f"Outdated Drupal: {generator}")
    if "joomla! 1." in generator or "joomla! 2." in generator or "joomla! 3." in generator:
        legacy_indicators.append(f"Outdated Joomla: {generator}")
    if "frontpage" in generator or "dreamweaver" in generator:
        legacy_indicators.append(f"Legacy editor: {generator}")
    if "php/5." in headers_str:
        legacy_indicators.append("End-of-life PHP 5.x header detected")

    # Modern indicators
    modern_indicators = []
    if any(m in scripts or m in generator for m in ["next", "nuxt", "gatsby", "shopify", "webflow", "wp-content/themes"]):
        modern_indicators.append("Modern framework / active CMS pattern detected")

    if legacy_indicators:
        score = 90.0
        confidence = 0.95
    elif modern_indicators:
        score = 15.0
        confidence = 0.85
    else:
        score = 40.0
        confidence = 0.60

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value={"generator": generator, "legacy_hits": legacy_indicators, "modern_hits": modern_indicators},
        normalized_score=score,
        weight=weight,
        evidence={"legacy_indicators": legacy_indicators, "modern_indicators": modern_indicators},
        source="crawler_meta",
        confidence=confidence,
    )


def evaluate_slow_site(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "slow_site"
    weight = SIGNAL_CATALOG[key].default_weight

    # Check for external Google PageSpeed audit data if available
    pagespeed_data = crawl.external_data.get("pagespeed") if crawl.external_data else None
    if pagespeed_data and isinstance(pagespeed_data, dict) and pagespeed_data.get("performance_score") is not None:
        perf_score = float(pagespeed_data["performance_score"])
        # High performance score (100) indicates fast site (low issue/opportunity ~0).
        # Low performance score indicates slow site (high issue/opportunity ~100).
        issue_score = round(max(0.0, min(100.0, 100.0 - perf_score)), 1)
        return SignalResult(
            signal_key=key,
            available=True,
            raw_value={"performance_score": perf_score, "core_web_vitals": pagespeed_data},
            normalized_score=issue_score,
            weight=weight,
            evidence={
                "provider": "google_pagespeed",
                "performance_score": perf_score,
                "largest_contentful_paint_ms": pagespeed_data.get("largest_contentful_paint_ms"),
                "core_web_vitals_passed": pagespeed_data.get("core_web_vitals_passed"),
                "load_time_ms": crawl.load_time_ms,
            },
            source="pagespeed_v5",
            confidence=0.98,
        )

    if crawl.load_time_ms is None:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_TIMING_DATA")

    load_ms = crawl.load_time_ms
    html_size = len(crawl.html.encode("utf-8"))

    if load_ms > 3500:
        score = 90.0
    elif load_ms > 2000:
        score = 65.0
    elif load_ms > 1000:
        score = 40.0
    else:
        score = 15.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=load_ms,
        normalized_score=score,
        weight=weight,
        evidence={"load_time_ms": load_ms, "html_bytes": html_size},
        source="crawler_latency",
        confidence=0.90,
    )



def evaluate_old_design(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "old_design"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    # Check for HTML5 semantic containers
    semantic_tags = soup.find_all(["header", "nav", "main", "footer", "section", "article"])
    tables = soup.find_all("table")
    frames = soup.find_all(["frame", "frameset"])

    old_cues = []
    if frames:
        old_cues.append("Uses framesets")
    if len(tables) > 4 and len(semantic_tags) == 0:
        old_cues.append("Table-based layout detected without semantic tags")

    if old_cues:
        score = 85.0
    elif len(semantic_tags) >= 3:
        score = 15.0
    else:
        score = 45.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value={"semantic_tag_count": len(semantic_tags), "table_count": len(tables)},
        normalized_score=score,
        weight=weight,
        evidence={"semantic_tags": len(semantic_tags), "cues": old_cues},
        source="crawler_dom",
        confidence=0.80,
    )


def evaluate_weak_ctas(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "weak_ctas"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    cta_regex = re.compile(
        r"(book\s+a\s+demo|get\s+started|start\s+free|contact\s+us|schedule|request\s+a\s+quote|sign\s+up|free\s+trial|talk\s+to\s+sales)",
        re.I,
    )
    buttons = soup.find_all(["button", "a"])
    matching_ctas = []
    for btn in buttons:
        text = btn.get_text(strip=True)
        if cta_regex.search(text):
            matching_ctas.append(text[:60])

    forms = soup.find_all("form")

    if len(matching_ctas) == 0 and len(forms) == 0:
        score = 90.0  # High opportunity (missing CTAs)
    elif len(matching_ctas) <= 1:
        score = 65.0
    else:
        score = 15.0  # Solid CTAs present

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value={"cta_count": len(matching_ctas), "form_count": len(forms)},
        normalized_score=score,
        weight=weight,
        evidence={"sample_ctas": matching_ctas[:5], "total_ctas": len(matching_ctas)},
        source="crawler_dom",
        confidence=0.85,
    )


def evaluate_not_mobile_friendly(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "not_mobile_friendly"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    viewport = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    if not viewport:
        score = 95.0
        evidence = {"viewport_meta": None, "issue": "Missing viewport meta tag"}
    else:
        content = viewport.get("content", "").lower()
        if "width=device-width" in content:
            score = 10.0
            evidence = {"viewport_meta": content, "issue": None}
        else:
            score = 60.0
            evidence = {"viewport_meta": content, "issue": "Non-standard viewport configuration"}

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=score > 50,
        normalized_score=score,
        weight=weight,
        evidence=evidence,
        source="crawler_meta",
        confidence=0.95,
    )


def evaluate_no_ssl(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "no_ssl"
    weight = SIGNAL_CATALOG[key].default_weight
    parsed = urlparse(crawl.url)
    is_https = parsed.scheme.lower() == "https"

    if crawl.ssl_valid is False or not is_https:
        score = 100.0
        evidence = {"scheme": parsed.scheme, "ssl_valid": crawl.ssl_valid}
    else:
        score = 0.0
        evidence = {"scheme": "https", "ssl_valid": True}

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=not is_https,
        normalized_score=score,
        weight=weight,
        evidence=evidence,
        source="crawler_tls",
        confidence=1.0,
    )


def evaluate_thin_content(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "thin_content"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    # Use an isolated local parser to extract visible text without mutating the shared soup
    local_soup = BeautifulSoup(crawl.html, "html.parser")
    for tag in local_soup(["script", "style", "nav", "footer", "noscript"]):
        tag.extract()
    text = local_soup.get_text(separator=" ", strip=True)
    words = [w for w in text.split() if len(w) > 1]
    word_count = len(words)

    if word_count < 150:
        score = 90.0
    elif word_count < 400:
        score = 55.0
    else:
        score = 15.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=word_count,
        normalized_score=score,
        weight=weight,
        evidence={"word_count": word_count},
        source="crawler_text",
        confidence=0.90,
    )


def evaluate_no_analytics(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "no_analytics"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    html_lower = crawl.html.lower()
    analytics_patterns = {
        "Google Analytics (GA4 / Universal)": ["googletagmanager.com/gtag/js", "google-analytics.com/analytics.js", "gtag("],
        "Google Tag Manager (GTM)": ["googletagmanager.com/gtm.js", "gtm-"],
        "Plausible": ["plausible.io"],
        "PostHog": ["posthog.com", "app.posthog.com"],
        "Segment": ["cdn.segment.com/analytics.js"],
        "Mixpanel": ["cdn.mxpnl.com"],
        "Hotjar": ["static.hotjar.com"],
    }

    found = []
    for tool, patterns in analytics_patterns.items():
        if any(p in html_lower for p in patterns):
            found.append(tool)

    if found:
        score = 10.0
    else:
        score = 85.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=len(found) == 0,
        normalized_score=score,
        weight=weight,
        evidence={"detected_analytics": found},
        source="crawler_scripts",
        confidence=0.90,
    )


def evaluate_accessibility(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "accessibility"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    images = soup.find_all("img")
    missing_alt = [img for img in images if not img.get("alt")]
    html_tag = soup.find("html")
    has_lang = html_tag and bool(html_tag.get("lang"))
    h1_tags = soup.find_all("h1")

    issues = []
    if not has_lang:
        issues.append("Missing <html lang> attribute")
    if len(h1_tags) == 0:
        issues.append("Missing <h1> primary heading")
    if images and len(missing_alt) / len(images) > 0.3:
        issues.append(f"{len(missing_alt)}/{len(images)} images missing alt text")

    if len(issues) >= 2:
        score = 80.0
    elif len(issues) == 1:
        score = 50.0
    else:
        score = 15.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value={"issue_count": len(issues)},
        normalized_score=score,
        weight=weight,
        evidence={"issues": issues, "total_images": len(images), "missing_alt": len(missing_alt)},
        source="crawler_a11y_heuristics",
        confidence=0.85,
    )


def evaluate_no_live_chat(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "no_live_chat"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    html_lower = crawl.html.lower()
    chat_patterns = {
        "Intercom": ["widget.intercom.io", "intercomsettings"],
        "Drift": ["js.driftt.com"],
        "HubSpot Chat": ["js.hs-scripts.com", "js.usemessages.com"],
        "Crisp": ["client.crisp.chat"],
        "Tawk.to": ["embed.tawk.to"],
        "Zendesk Chat": ["static.zdassets.com"],
        "LiveChat": ["cdn.livechatinc.com"],
    }

    found = []
    for tool, patterns in chat_patterns.items():
        if any(p in html_lower for p in patterns):
            found.append(tool)

    score = 10.0 if found else 70.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=len(found) == 0,
        normalized_score=score,
        weight=weight,
        evidence={"detected_chat": found},
        source="crawler_scripts",
        confidence=0.90,
    )


# ---------------- Marketing Signals (11 - 22) ----------------

def evaluate_poor_seo(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "poor_seo"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""
    meta_desc_tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    meta_desc = meta_desc_tag.get("content", "").strip() if meta_desc_tag else ""
    canonical_tag = soup.find("link", attrs={"rel": "canonical"})

    issues = []
    if not title:
        issues.append("Missing <title> tag")
    elif len(title) < 15 or len(title) > 75:
        issues.append(f"Suboptimal title length ({len(title)} chars)")

    if not meta_desc:
        issues.append("Missing meta description")
    elif len(meta_desc) < 50 or len(meta_desc) > 170:
        issues.append(f"Suboptimal meta description length ({len(meta_desc)} chars)")

    if not canonical_tag:
        issues.append("Missing canonical link")

    if len(issues) >= 3:
        score = 85.0
    elif len(issues) >= 1:
        score = 55.0
    else:
        score = 15.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value={"title_length": len(title), "desc_length": len(meta_desc)},
        normalized_score=score,
        weight=weight,
        evidence={"title": title, "meta_desc": meta_desc[:100], "issues": issues},
        source="crawler_meta",
        confidence=0.90,
    )


def evaluate_poor_aeo_geo(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "poor_aeo_geo"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    json_ld_scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    schemas_found = []
    for s in json_ld_scripts:
        content = s.get_text(strip=True)
        for schema_type in ["Organization", "LocalBusiness", "Corporation", "FAQPage", "Product", "WebSite"]:
            if f'"{schema_type}"' in content or f"'{schema_type}'" in content:
                schemas_found.append(schema_type)

    if schemas_found:
        score = 15.0
    else:
        score = 85.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=len(schemas_found) == 0,
        normalized_score=score,
        weight=weight,
        evidence={"schemas_found": schemas_found, "json_ld_count": len(json_ld_scripts)},
        source="crawler_json_ld",
        confidence=0.90,
    )


def evaluate_low_domain_trust(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "low_domain_trust"
    weight = SIGNAL_CATALOG[key].default_weight
    parsed = urlparse(crawl.url)
    hostname = (parsed.hostname or "").lower()

    if not hostname:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HOSTNAME")

    # High-risk / spam TLDs
    spam_tlds = [".xyz", ".top", ".work", ".click", ".buzz", ".live", ".guru", ".cfd", ".monster"]
    standard_tlds = [".com", ".org", ".net", ".io", ".ai", ".co", ".gov", ".edu"]

    is_spam_tld = any(hostname.endswith(tld) for tld in spam_tlds)
    is_standard_tld = any(hostname.endswith(tld) for tld in standard_tlds)

    if is_spam_tld:
        score = 80.0
    elif is_standard_tld:
        score = 25.0
    else:
        score = 45.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=hostname,
        normalized_score=score,
        weight=weight,
        evidence={"hostname": hostname, "is_standard_tld": is_standard_tld},
        source="dns_hostname",
        confidence=0.75,
    )


def evaluate_stale_blog(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "stale_blog"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    links = [a.get("href", "").lower() for a in soup.find_all("a", href=True)]
    has_blog_link = any("/blog" in l or "/news" in l or "/articles" in l or "/insights" in l for l in links)

    if not has_blog_link:
        score = 65.0  # Missing blog opportunity
        evidence = {"has_blog_link": False, "status": "No blog detected"}
    else:
        # Check publication date mentions
        current_year = datetime.now().year
        recent_years = [str(current_year), str(current_year - 1)]
        has_recent_year = any(y in crawl.html for y in recent_years)

        if has_recent_year:
            score = 15.0
            evidence = {"has_blog_link": True, "status": "Active blog with recent year timestamps"}
        else:
            score = 75.0
            evidence = {"has_blog_link": True, "status": "Blog link found but lacking recent dates"}

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=has_blog_link,
        normalized_score=score,
        weight=weight,
        evidence=evidence,
        source="crawler_links",
        confidence=0.80,
    )


def evaluate_no_press(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "no_press"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    links = [a.get("href", "").lower() for a in soup.find_all("a", href=True)]
    has_press = any("/press" in l or "/newsroom" in l or "/media-kit" in l or "/in-the-news" in l for l in links)

    score = 15.0 if has_press else 65.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=not has_press,
        normalized_score=score,
        weight=weight,
        evidence={"press_link_found": has_press},
        source="crawler_links",
        confidence=0.80,
    )


def evaluate_no_case_studies(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "no_case_studies"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    links = [a.get("href", "").lower() for a in soup.find_all("a", href=True)]
    has_case_studies = any("/case-stud" in l or "/customer" in l or "/client-stories" in l or "/testimonials" in l for l in links)
    text_proof = any(w in crawl.html.lower() for w in ["testimonials", "case studies", "what our clients say"])

    if has_case_studies or text_proof:
        score = 15.0
    else:
        score = 80.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=not (has_case_studies or text_proof),
        normalized_score=score,
        weight=weight,
        evidence={"case_study_link": has_case_studies, "social_proof_text": text_proof},
        source="crawler_content",
        confidence=0.85,
    )


def evaluate_no_video(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "no_video"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    has_video_tag = bool(soup.find("video"))
    iframes = soup.find_all("iframe")
    has_video_iframe = any(
        any(v in (iframe.get("src", "")).lower() for v in ["youtube.com", "youtu.be", "vimeo.com", "wistia.net", "loom.com"])
        for iframe in iframes
    )

    found = has_video_tag or has_video_iframe
    score = 10.0 if found else 60.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=not found,
        normalized_score=score,
        weight=weight,
        evidence={"video_tag": has_video_tag, "video_iframe": has_video_iframe},
        source="crawler_media",
        confidence=0.90,
    )


def evaluate_weak_social(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "weak_social"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    links = [a.get("href", "").lower() for a in soup.find_all("a", href=True)]
    social_profiles = {
        "linkedin": any("linkedin.com/company" in l for l in links),
        "twitter": any("twitter.com/" in l or "x.com/" in l for l in links),
        "youtube": any("youtube.com/" in l for l in links),
        "github": any("github.com/" in l for l in links),
    }

    found = [k for k, v in social_profiles.items() if v]

    if len(found) >= 2:
        score = 15.0
    elif len(found) == 1:
        score = 50.0
    else:
        score = 85.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=found,
        normalized_score=score,
        weight=weight,
        evidence={"detected_social_profiles": found},
        source="crawler_links",
        confidence=0.90,
    )


def evaluate_weak_email_capture(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "weak_email_capture"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    email_inputs = soup.find_all("input", attrs={"type": re.compile(r"^email$", re.I)})
    newsletter_cues = any(w in crawl.html.lower() for w in ["subscribe to our newsletter", "join our newsletter", "get updates"])

    has_capture = bool(email_inputs) and newsletter_cues
    score = 15.0 if has_capture else 75.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=not has_capture,
        normalized_score=score,
        weight=weight,
        evidence={"email_input_count": len(email_inputs), "newsletter_cues": newsletter_cues},
        source="crawler_forms",
        confidence=0.85,
    )


def evaluate_ppc_spend(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "ppc_spend"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    html_lower = crawl.html.lower()
    ad_pixels = {
        "Meta Pixel": ["connect.facebook.net/en_us/fbevents.js", "fbq("],
        "Google Ads": ["googleads.g.doubleclick.net", "aw-", "google_conversion_id"],
        "LinkedIn Insight": ["snap.licdn.com/li.lms-analytics/insight.min.js", "lintrk("],
    }

    found = []
    for pixel, patterns in ad_pixels.items():
        if any(p in html_lower for p in patterns):
            found.append(pixel)

    # Active PPC spend indicates marketing budget (lower issue / high qualification opportunity)
    score = 20.0 if found else 75.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=found,
        normalized_score=score,
        weight=weight,
        evidence={"ad_pixels_detected": found},
        source="crawler_scripts",
        confidence=0.85,
    )


def evaluate_hiring(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "hiring"
    weight = SIGNAL_CATALOG[key].default_weight
    if not crawl.html:
        return SignalResult(signal_key=key, available=False, weight=weight, error_code="NO_HTML")

    links = [a.get("href", "").lower() for a in soup.find_all("a", href=True)]
    has_careers_link = any("/careers" in l or "/jobs" in l or "/work-with-us" in l or "/open-positions" in l for l in links)
    has_ats = any(ats in crawl.html.lower() for ats in ["greenhouse.io", "lever.co", "workable.com", "ashbyhq.com"])

    is_hiring = has_careers_link or has_ats
    score = 20.0 if is_hiring else 60.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value=is_hiring,
        normalized_score=score,
        weight=weight,
        evidence={"careers_link": has_careers_link, "ats_embed": has_ats},
        source="crawler_careers",
        confidence=0.85,
    )


def evaluate_low_review_rating(crawl: CrawlData, soup: BeautifulSoup) -> SignalResult:
    key = "low_review_rating"
    weight = SIGNAL_CATALOG[key].default_weight

    # Extract legitimate review rating only (e.g. from schema AggregateRating or external verified data)
    rating_val: Optional[float] = None
    rating_count: Optional[int] = None

    if "rating" in crawl.external_data:
        try:
            rating_val = float(crawl.external_data["rating"])
            rating_count = int(crawl.external_data.get("review_count", 0))
        except (ValueError, TypeError):
            pass

    # Never fabricate reviews! If not available, mark available: false
    if rating_val is None:
        return SignalResult(
            signal_key=key,
            available=False,
            weight=weight,
            evidence={"note": "No verified external review data available; omitting from score without penalty."},
            source="reviews_none",
            error_code="DATA_UNAVAILABLE",
        )

    if rating_val < 3.5:
        score = 85.0
    elif rating_val < 4.2:
        score = 50.0
    else:
        score = 15.0

    return SignalResult(
        signal_key=key,
        available=True,
        raw_value={"rating": rating_val, "review_count": rating_count},
        normalized_score=score,
        weight=weight,
        evidence={"rating": rating_val, "review_count": rating_count},
        source="verified_reviews",
        confidence=0.90,
    )


EVALUATOR_DISPATCH = {
    # Website
    "legacy_platform": evaluate_legacy_platform,
    "slow_site": evaluate_slow_site,
    "old_design": evaluate_old_design,
    "weak_ctas": evaluate_weak_ctas,
    "not_mobile_friendly": evaluate_not_mobile_friendly,
    "no_ssl": evaluate_no_ssl,
    "thin_content": evaluate_thin_content,
    "no_analytics": evaluate_no_analytics,
    "accessibility": evaluate_accessibility,
    "no_live_chat": evaluate_no_live_chat,
    # Marketing
    "poor_seo": evaluate_poor_seo,
    "poor_aeo_geo": evaluate_poor_aeo_geo,
    "low_domain_trust": evaluate_low_domain_trust,
    "stale_blog": evaluate_stale_blog,
    "no_press": evaluate_no_press,
    "no_case_studies": evaluate_no_case_studies,
    "no_video": evaluate_no_video,
    "weak_social": evaluate_weak_social,
    "weak_email_capture": evaluate_weak_email_capture,
    "ppc_spend": evaluate_ppc_spend,
    "hiring": evaluate_hiring,
    "low_review_rating": evaluate_low_review_rating,
}


def evaluate_all_signals(crawl: CrawlData) -> List[SignalResult]:
    soup = BeautifulSoup(crawl.html, "html.parser") if crawl.html else BeautifulSoup("", "html.parser")
    results = []
    for key, evaluator in EVALUATOR_DISPATCH.items():
        results.append(evaluator(crawl, soup))
    return results
