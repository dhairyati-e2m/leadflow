import csv
import io
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from pydantic import BaseModel, Field


class ParsedLeadRow(BaseModel):
    row_number: int
    company_name: str
    domain: str
    industry: Optional[str] = None
    location: Optional[str] = None
    employee_count: Optional[str] = None
    raw_data: Dict[str, str] = Field(default_factory=dict)
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_title: Optional[str] = None


class CSVImportResult(BaseModel):
    total_rows: int
    valid_leads: List[ParsedLeadRow]
    duplicates_in_file: int
    errors: List[Dict[str, Any]]


DANGEROUS_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "%")


def sanitize_csv_cell(value: Any) -> str:
    """
    Guards against CSV Formula Injection (CWE-1236).
    If a cell starts with an executable formula character (=, +, -, @, etc.),
    safely neutralize it by prepending a single quote.
    """
    if value is None:
        return ""
    val_str = str(value)
    if not val_str:
        return ""
    if val_str.startswith(DANGEROUS_FORMULA_PREFIXES):
        return f"'{val_str}"
    return val_str.strip()


def normalize_domain(raw_url_or_domain: str) -> str:
    """
    Normalizes a website URL or company domain into a clean lowercase domain
    e.g. 'https://WWW.Example.com/about?ref=1' -> 'example.com'
    """
    if not raw_url_or_domain:
        return ""
    cleaned = raw_url_or_domain.strip().lower()
    # Add scheme if missing so urlparse extracts netloc reliably
    if not cleaned.startswith(("http://", "https://")):
        cleaned = "https://" + cleaned

    try:
        parsed = urlparse(cleaned)
        netloc = parsed.netloc or parsed.path.split("/")[0]
        # Remove port if present
        host = netloc.split(":")[0]
        # Remove www.
        if host.startswith("www."):
            host = host[4:]
        # Strip trailing dots or whitespace
        return host.strip(".")
    except Exception:
        # Fallback regex extraction
        match = re.search(r"([a-z0-9\-]+\.[a-z]{2,})", raw_url_or_domain.lower())
        return match.group(1) if match else raw_url_or_domain.lower().strip()


def parse_leads_csv(
    csv_content: str,
    max_rows: int = 2000,
) -> CSVImportResult:
    """
    Parses, validates, deduplicates, and sanitizes incoming CSV lead records.
    Protects against formula injection, malformed lines, and invalid headers.
    """
    stream = io.StringIO(csv_content.strip())
    reader = csv.reader(stream)

    try:
        header = next(reader)
    except StopIteration:
        return CSVImportResult(total_rows=0, valid_leads=[], duplicates_in_file=0, errors=[{"error": "Empty CSV file"}])

    # Normalize header names for flexible column matching
    normalized_headers = [re.sub(r"[^a-z0-9_]", "", h.strip().lower().replace(" ", "_")) for h in header]

    col_map = {
        "company_name": -1,
        "domain": -1,
        "industry": -1,
        "location": -1,
        "employee_count": -1,
        "contact_name": -1,
        "contact_email": -1,
        "contact_title": -1,
    }

    # Match common synonyms
    for idx, h in enumerate(normalized_headers):
        if h in ("company_name", "company", "name", "organization", "account_name") and col_map["company_name"] == -1:
            col_map["company_name"] = idx
        elif h in ("domain", "website", "url", "company_domain", "web_site", "company_website") and col_map["domain"] == -1:
            col_map["domain"] = idx
        elif h in ("industry", "sector", "category") and col_map["industry"] == -1:
            col_map["industry"] = idx
        elif h in ("location", "country", "city", "state", "region", "headquarters") and col_map["location"] == -1:
            col_map["location"] = idx
        elif h in ("employee_count", "employees", "size", "company_size", "headcount") and col_map["employee_count"] == -1:
            col_map["employee_count"] = idx
        elif h in ("contact_name", "contact", "decision_maker", "person_name") and col_map["contact_name"] == -1:
            col_map["contact_name"] = idx
        elif h in ("contact_email", "email", "decision_maker_email") and col_map["contact_email"] == -1:
            col_map["contact_email"] = idx
        elif h in ("contact_title", "title", "job_title", "role") and col_map["contact_title"] == -1:
            col_map["contact_title"] = idx

    if col_map["company_name"] == -1 and col_map["domain"] == -1:
        return CSVImportResult(
            total_rows=0,
            valid_leads=[],
            duplicates_in_file=0,
            errors=[{"error": "CSV must contain at least a 'company_name' or 'domain'/'website' column."}],
        )

    valid_leads: List[ParsedLeadRow] = []
    seen_domains = set()
    duplicates_in_file = 0
    errors: List[Dict[str, Any]] = []

    for row_idx, row in enumerate(reader, start=2):
        if row_idx - 1 > max_rows:
            errors.append({"row": row_idx, "warning": f"Row limit of {max_rows} exceeded; remaining rows truncated."})
            break

        if not row or all(not cell.strip() for cell in row):
            continue  # Skip empty lines

        # Extract values
        raw_company = row[col_map["company_name"]] if col_map["company_name"] >= 0 and col_map["company_name"] < len(row) else ""
        raw_domain = row[col_map["domain"]] if col_map["domain"] >= 0 and col_map["domain"] < len(row) else ""

        company_name = sanitize_csv_cell(raw_company)
        domain = normalize_domain(sanitize_csv_cell(raw_domain))

        # Fallback if domain was provided but company name was blank
        if not company_name and domain:
            company_name = domain.split(".")[0].capitalize()
        # Fallback if company was provided but domain was blank
        if not domain and company_name:
            domain = re.sub(r"[^a-z0-9\-]", "", company_name.lower()) + ".com"

        if not company_name and not domain:
            errors.append({"row": row_idx, "error": "Missing both company name and domain."})
            continue

        # In-file deduplication by domain
        if domain in seen_domains:
            duplicates_in_file += 1
            continue
        seen_domains.add(domain)

        # Build other sanitized fields
        industry = sanitize_csv_cell(row[col_map["industry"]]) if col_map["industry"] >= 0 and col_map["industry"] < len(row) else None
        location = sanitize_csv_cell(row[col_map["location"]]) if col_map["location"] >= 0 and col_map["location"] < len(row) else None
        employee_count = sanitize_csv_cell(row[col_map["employee_count"]]) if col_map["employee_count"] >= 0 and col_map["employee_count"] < len(row) else None
        contact_name = sanitize_csv_cell(row[col_map["contact_name"]]) if col_map["contact_name"] >= 0 and col_map["contact_name"] < len(row) else None
        contact_email = sanitize_csv_cell(row[col_map["contact_email"]]) if col_map["contact_email"] >= 0 and col_map["contact_email"] < len(row) else None
        contact_title = sanitize_csv_cell(row[col_map["contact_title"]]) if col_map["contact_title"] >= 0 and col_map["contact_title"] < len(row) else None

        raw_dict = {
            normalized_headers[i]: sanitize_csv_cell(row[i])
            for i in range(min(len(normalized_headers), len(row)))
        }

        valid_leads.append(
            ParsedLeadRow(
                row_number=row_idx,
                company_name=company_name,
                domain=domain,
                industry=industry,
                location=location,
                employee_count=employee_count,
                raw_data=raw_dict,
                contact_name=contact_name,
                contact_email=contact_email,
                contact_title=contact_title,
            )
        )

    return CSVImportResult(
        total_rows=len(valid_leads) + duplicates_in_file + len(errors),
        valid_leads=valid_leads,
        duplicates_in_file=duplicates_in_file,
        errors=errors,
    )
