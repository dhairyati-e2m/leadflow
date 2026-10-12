import pytest
from bs4 import BeautifulSoup

from backend.app.domain.signals.catalog import (
    ALL_SIGNAL_KEYS,
    MARKETING_SIGNAL_KEYS,
    SIGNAL_CATALOG,
    WEBSITE_SIGNAL_KEYS,
)
from backend.app.domain.signals.evaluators import (
    CrawlData,
    EVALUATOR_DISPATCH,
    SignalResult,
    evaluate_all_signals,
)


def test_signal_catalog_completeness():
    """Verify that exactly 22 stable signals are specified (10 Website + 12 Marketing)."""
    assert len(ALL_SIGNAL_KEYS) == 22
    assert len(WEBSITE_SIGNAL_KEYS) == 10
    assert len(MARKETING_SIGNAL_KEYS) == 12
    assert len(EVALUATOR_DISPATCH) == 22

    for key in ALL_SIGNAL_KEYS:
        sig_def = SIGNAL_CATALOG[key]
        assert sig_def.default_weight > 0
        assert sig_def.name
        assert sig_def.description


def test_evaluate_all_signals_missing_html():
    """When HTML is completely empty or missing, signals handle it gracefully without crashing."""
    crawl = CrawlData(url="https://example.com", html="", load_time_ms=None, ssl_valid=True)
    results = evaluate_all_signals(crawl)
    assert len(results) == 22

    res_map = {r.signal_key: r for r in results}
    # Signals requiring HTML or timing should report available=False
    assert res_map["slow_site"].available is False
    assert res_map["slow_site"].error_code == "NO_TIMING_DATA"
    assert res_map["legacy_platform"].available is False
    # Review rating must be marked unavailable without fabricated scores
    assert res_map["low_review_rating"].available is False
    assert res_map["low_review_rating"].error_code == "DATA_UNAVAILABLE"


def test_evaluate_website_signals_with_rich_modern_site():
    """Verify evaluator behavior on a fast, modern HTML5 responsive website."""
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Acme Software - Enterprise Cloud Automation Platform</title>
        <meta name="description" content="Discover Acme's enterprise cloud automation platform designed to accelerate B2B workflows and maximize ROI.">
        <link rel="canonical" href="https://acme.com/">
        <script type="application/ld+json">{"@context": "https://schema.org", "@type": "Organization", "name": "Acme"}</script>
        <script src="https://www.googletagmanager.com/gtag/js?id=G-123456"></script>
        <script src="https://widget.intercom.io/widget/app123"></script>
    </head>
    <body>
        <header>
            <nav><a href="/blog">Blog</a> <a href="/case-studies">Case Studies</a> <a href="/careers">Careers</a></nav>
        </header>
        <main>
            <h1>Automate Your Enterprise Cloud Workflows</h1>
            <p>Acme delivers leading-edge infrastructure and automated solutions for world-class technology organizations. Our cloud orchestration platform ensures high availability, strict security compliance, and effortless scalability across multi-cloud environments.</p>
            <p>Founded by engineers and trusted by Global 2000 leaders, our software eliminates tedious manual provisioning and secures confidential cloud data.</p>
            <button>Get Started Free</button>
            <a href="/contact">Book a Demo</a>
            <img src="/logo.png" alt="Acme Logo">
            <video src="/intro.mp4"></video>
            <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
            <a href="https://twitter.com/acme">Twitter</a>
        </main>
        <footer>
            <input type="email" placeholder="Your work email">
            <span>Subscribe to our newsletter for cloud insights.</span>
        </footer>
    </body>
    </html>
    """
    crawl = CrawlData(
        url="https://acme.com",
        html=html,
        load_time_ms=850.0,
        ssl_valid=True,
    )
    results = evaluate_all_signals(crawl)
    res_map = {r.signal_key: r for r in results}

    # SSL should be satisfied (score 0.0)
    assert res_map["no_ssl"].normalized_score == 0.0
    # Fast site
    assert res_map["slow_site"].normalized_score <= 20.0
    # Mobile friendly
    assert res_map["not_mobile_friendly"].normalized_score <= 15.0
    # Analytics detected
    assert res_map["no_analytics"].normalized_score <= 15.0
    # Live chat detected
    assert res_map["no_live_chat"].normalized_score <= 15.0
    # Strong CTAs present
    assert res_map["weak_ctas"].normalized_score <= 20.0
    # SEO fundamentals solid
    assert res_map["poor_seo"].normalized_score <= 20.0
    # AEO / JSON-LD detected
    assert res_map["poor_aeo_geo"].normalized_score <= 20.0
    # Case studies detected
    assert res_map["no_case_studies"].normalized_score <= 20.0
    # Video detected
    assert res_map["no_video"].normalized_score <= 15.0
    # Social links detected
    assert res_map["weak_social"].normalized_score <= 20.0
    # Email capture detected
    assert res_map["weak_email_capture"].normalized_score <= 20.0
    # Hiring detected
    assert res_map["hiring"].normalized_score <= 25.0


def test_evaluate_signals_with_outdated_site():
    """Verify evaluator behavior on an outdated, HTTP, slow, non-responsive site."""
    html = """
    <html>
    <head>
        <meta name="generator" content="WordPress 4.2.1">
    </head>
    <body>
        <table cellpadding="0" cellspacing="0">
            <tr><td>Welcome to our page</td></tr>
        </table>
        <img src="pic.jpg">
    </body>
    </html>
    """
    crawl = CrawlData(
        url="http://oldsite.com",
        html=html,
        load_time_ms=4500.0,
        ssl_valid=False,
    )
    results = evaluate_all_signals(crawl)
    res_map = {r.signal_key: r for r in results}

    # Insecure HTTP
    assert res_map["no_ssl"].normalized_score == 100.0
    # Very slow
    assert res_map["slow_site"].normalized_score == 90.0
    # Outdated platform
    assert res_map["legacy_platform"].normalized_score == 90.0
    # Missing viewport
    assert res_map["not_mobile_friendly"].normalized_score == 95.0
    # Missing analytics
    assert res_map["no_analytics"].normalized_score == 85.0
    # Thin content
    assert res_map["thin_content"].normalized_score == 90.0
