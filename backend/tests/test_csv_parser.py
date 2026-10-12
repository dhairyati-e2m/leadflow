import pytest
from backend.app.domain.ingestion.csv_parser import (
    normalize_domain,
    parse_leads_csv,
    sanitize_csv_cell,
)


def test_domain_normalization():
    assert normalize_domain("https://WWW.Example.com/about?ref=1") == "example.com"
    assert normalize_domain("HTTP://sub.test.org/path") == "sub.test.org"
    assert normalize_domain("acme-corp.io") == "acme-corp.io"
    assert normalize_domain("www.domain.co.uk/") == "domain.co.uk"


def test_csv_formula_injection_sanitization():
    # Dangerous formula injection payloads
    assert sanitize_csv_cell("=1+1") == "'=1+1"
    assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
    assert sanitize_csv_cell("-2+3") == "'-2+3"
    assert sanitize_csv_cell("@SUM(1,2)") == "'@SUM(1,2)"
    assert sanitize_csv_cell("\tmalicious") == "'\tmalicious"
    # Safe text remains unchanged
    assert sanitize_csv_cell("Acme Corporation") == "Acme Corporation"
    assert sanitize_csv_cell("ceo@acme.com") == "ceo@acme.com"


def test_parse_leads_csv_valid_and_deduplicated():
    csv_text = """Company Name,Website,Industry,Location,Contact Name,Contact Email
Acme Corp,https://acme.com,Software,San Francisco,Alice Smith,alice@acme.com
=Dangerous Inc,http://www.danger.io,Finance,New York,Bob,=cmd|calc
Acme Corp Duplicate,https://acme.com/contact,Software,San Francisco,Charlie,charlie@acme.com
Beta LLC,beta.com,Healthcare,Boston,David,david@beta.com
"""
    result = parse_leads_csv(csv_text)

    # Acme Corp duplicate with same domain should be deduplicated
    assert result.duplicates_in_file == 1
    assert len(result.valid_leads) == 3

    # Check formula injection sanitized in lead 2
    danger_lead = next(l for l in result.valid_leads if l.domain == "danger.io")
    assert danger_lead.company_name.startswith("'=")
    assert danger_lead.contact_email.startswith("'=")

    # Check domain normalization
    acme_lead = next(l for l in result.valid_leads if l.domain == "acme.com")
    assert acme_lead.company_name == "Acme Corp"
    assert acme_lead.industry == "Software"


def test_parse_leads_csv_missing_columns():
    csv_text = """foo,bar,baz
1,2,3
"""
    result = parse_leads_csv(csv_text)
    assert len(result.valid_leads) == 0
    assert len(result.errors) > 0
    assert "company_name" in result.errors[0]["error"]
