# Signal-to-Provider Mapping Matrix (All 22 Signal Engines)

LeadFlow evaluates prospective B2B customers using 22 deterministic qualification signals. In accordance with **Mandatory Rule A** and **Rule B**, this document details the primary data source, candidate external providers, free fallbacks, evidence structures, and missing-data semantics for every engine.

---

## 1. Architectural Principles for Signal Data

1. **Deterministic Scoring Primacy**: The scoring engine in [scoring.py](file:///c:/Users/Dhairyati%20Pandya/Desktop/leadflow/backend/app/domain/scoring.py) is authoritative. External APIs supply raw evidence; they never directly calculate the score or bypass qualification rules.
2. **Missing-Data Fairness**: If a signal is unavailable (e.g. external API quota reached or no blog found), the engine calculates the overall score based on the available weight denominator. **Unavailable data never lowers a lead's score by default.**
3. **Local-First Capability**: 21 of 22 signals are extracted directly by LeadFlow's local safe crawler without consuming external API allowances.
4. **No Hallucinated Data**: Review ratings, backlinks, advertising spend, and contact records are never fabricated. If verified evidence is absent, the signal reports `available: false` with error code `DATA_UNAVAILABLE`.

---

## 2. Complete 22-Signal Matrix

| # | Signal Key | Category | Primary Default Source | Secondary / Candidate Provider | Free Alternative / Fallback | Evidence Fields Supplied | Missing Data Behavior |
|---|---|---|---|---|---|---|---|
| 1 | `legacy_platform` | Website | Local Safe Crawler | Wappalyzer CLI / Local regex | Local HTML `meta[generator]`, scripts, headers | `generator`, `legacy_indicators`, `modern_indicators` | Omits from weight denominator |
| 2 | `slow_site` | Website | Local Safe Crawler (latency) | **Google PageSpeed Insights API** | Local HTTP response latency (`load_time_ms`) | `load_time_ms`, `html_bytes`, (CrUX LCP/INP if PageSpeed) | Omits from weight denominator |
| 3 | `old_design` | Website | Local Safe Crawler | Playwright (screenshot heuristics) | Local HTML5 semantic structure & viewport | `has_viewport`, `table_layouts`, `html5_tags` | Omits from weight denominator |
| 4 | `weak_ctas` | Website | Local Safe Crawler | Local DOM parser | Local button & conversion form counter | `ctas_found`, `form_count`, `cta_count` | Omits from weight denominator |
| 5 | `not_mobile_friendly`| Website | Local Safe Crawler | Google PageSpeed (mobile score) | Local viewport meta tag & media query check | `has_viewport_tag`, `responsive_cues` | Omits from weight denominator |
| 6 | `no_ssl` | Website | Local Safe Crawler | `ssl` / `socket` standard library | Local HTTPS handshake & TLS certificate check | `ssl_valid`, `https_enforced` | Omits from weight denominator |
| 7 | `thin_content` | Website | Local Safe Crawler | Local BeautifulSoup | Local body word count (< 200 words = thin) | `word_count`, `meaningful_text_density` | Omits from weight denominator |
| 8 | `no_analytics` | Website | Local Safe Crawler | Built-in script pattern matcher | Local regex scan (GA4, GTM, Plausible, PostHog) | `detected_analytics`, `tag_manager_found` | Omits from weight denominator |
| 9 | `accessibility` | Website | Local Safe Crawler | Google PageSpeed / axe-core | Local automated WCAG checks (alt tags, aria) | `missing_alt_count`, `missing_labels` | Omits from weight denominator |
| 10 | `no_live_chat` | Website | Local Safe Crawler | Built-in widget catalog | Local script scan (Intercom, Drift, Crisp, Tawk) | `chat_widget_detected` | Omits from weight denominator |
| 11 | `poor_seo` | Marketing | Local Safe Crawler | Local DOM parser | Title tag, meta description, canonical, H1 tags | `title_present`, `meta_desc_length`, `h1_count` | Omits from weight denominator |
| 12 | `poor_aeo_geo` | Marketing | Local Safe Crawler | Schema.org validator | Local JSON-LD parser (`@type` Organization, LocalBusiness) | `schemas_found`, `json_ld_count` | Omits from weight denominator |
| 13 | `low_domain_trust` | Marketing | Local Safe Crawler | Public TLD risk catalog | Hostname structure and spam TLD heuristics | `hostname`, `is_standard_tld`, `tld_risk_flag` | Omits from weight denominator |
| 14 | `stale_blog` | Marketing | Local Safe Crawler | Local link extractor | Discovers `/blog`, `/news` links & checks year timestamps | `has_blog_link`, `recent_timestamps` | Omits from weight denominator |
| 15 | `no_press` | Marketing | Local Safe Crawler | Local link extractor | Discovers `/press`, `/newsroom`, `/media-kit` links | `press_link_found` | Omits from weight denominator |
| 16 | `no_case_studies` | Marketing | Local Safe Crawler | Local content parser | Discovers `/case-studies`, `/testimonials` links & text | `case_study_link`, `social_proof_text` | Omits from weight denominator |
| 17 | `no_video` | Marketing | Local Safe Crawler | Local media parser | Discovers `<video>`, YouTube, Vimeo, Wistia iframes | `video_tag`, `video_iframe` | Omits from weight denominator |
| 18 | `weak_social` | Marketing | Local Safe Crawler | Local link parser | Discovers links to LinkedIn, Twitter/X, YouTube, GitHub | `detected_social_profiles` | Omits from weight denominator |
| 19 | `weak_email_capture`| Marketing | Local Safe Crawler | Local form parser | Discovers newsletter input forms and subscription cues | `email_input_count`, `newsletter_cues` | Omits from weight denominator |
| 20 | `ppc_spend` | Marketing | Local Safe Crawler | Built-in pixel catalog | Detects ad scripts (Meta Pixel, Google Ads, LinkedIn) | `ad_pixels_detected` | Omits from weight denominator |
| 21 | `hiring` | Marketing | Local Safe Crawler | ATS embed catalog | Discovers `/careers` links or Greenhouse/Lever/Workable | `careers_link`, `ats_embed` | Omits from weight denominator |
| 22 | `low_review_rating` | Marketing | Verified External Data | Google Places (if auth) / G2 schema | Reports `available: false` if no verified source | `rating`, `review_count`, `source` | **Strictly `available: false` (no penalty)** |

---

## 3. Signal Result Data Contract

Every signal evaluation returns a structured payload matching the contract in [evaluators.py](file:///c:/Users/Dhairyati%20Pandya/Desktop/leadflow/backend/app/domain/signals/evaluators.py#L14-L25):

```json
{
  "signal_key": "slow_site",
  "available": true,
  "raw_value": 1140.2,
  "normalized_score": 65.0,
  "weight": 1.2,
  "evidence": {
    "load_time_ms": 1140.2,
    "html_bytes": 45120,
    "provider": "crawler_latency"
  },
  "source": "crawler_latency",
  "confidence": 0.90,
  "observed_at": "2026-10-13T12:00:00Z",
  "error_code": null
}
```

When an external provider fails or its quota is exhausted, `available` is set to `false`, `error_code` records the specific failure reason (e.g. `QUOTA_EXHAUSTED`, `PROVIDER_DISABLED`, `DATA_UNAVAILABLE`), and the scoring engine safely excludes the signal's weight from the denominator.
