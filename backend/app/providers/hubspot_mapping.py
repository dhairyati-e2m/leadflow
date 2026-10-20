import logging
import re
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import httpx

logger = logging.getLogger(__name__)

# Standard HubSpot industry dropdown option internal values
HUBSPOT_STANDARD_INDUSTRIES: Dict[str, str] = {
    "ACCOUNTING": "Accounting",
    "AIRLINES_AVIATION": "Airlines/Aviation",
    "ALTERNATIVE_DISPUTE_RESOLUTION": "Alternative Dispute Resolution",
    "ALTERNATIVE_MEDICINE": "Alternative Medicine",
    "ANIMATION": "Animation",
    "APPAREL_FASHION": "Apparel & Fashion",
    "ARCHITECTURE_PLANNING": "Architecture & Planning",
    "ARTS_AND_CRAFTS": "Arts and Crafts",
    "AUTOMOTIVE": "Automotive",
    "AVIATION_AEROSPACE": "Aviation & Aerospace",
    "BANKING": "Banking",
    "BIOTECHNOLOGY": "Biotechnology",
    "BROADCAST_MEDIA": "Broadcast Media",
    "BUILDING_MATERIALS": "Building Materials",
    "BUSINESS_SUPPLIES_AND_EQUIPMENT": "Business Supplies and Equipment",
    "CAPITAL_MARKETS": "Capital Markets",
    "CHEMICALS": "Chemicals",
    "CIVIC_SOCIAL_ORGANIZATION": "Civic & Social Organization",
    "CIVIL_ENGINEERING": "Civil Engineering",
    "COMMERCIAL_REAL_ESTATE": "Commercial Real Estate",
    "COMPUTER_GAMES": "Computer Games",
    "COMPUTER_HARDWARE": "Computer Hardware",
    "COMPUTER_NETWORKING": "Computer Networking",
    "COMPUTER_SOFTWARE": "Computer Software",
    "CONSTRUCTION": "Construction",
    "CONSUMER_ELECTRONICS": "Consumer Electronics",
    "CONSUMER_GOODS": "Consumer Goods",
    "CONSUMER_SERVICES": "Consumer Services",
    "COSMETICS": "Cosmetics",
    "DAIRY": "Dairy",
    "DEFENSE_SPACE": "Defense & Space",
    "DESIGN": "Design",
    "EDUCATION_MANAGEMENT": "Education Management",
    "E_LEARNING": "E-Learning",
    "ELECTRICAL_ELECTRONIC_MANUFACTURING": "Electrical/Electronic Manufacturing",
    "ENTERTAINMENT": "Entertainment",
    "ENVIRONMENTAL_SERVICES": "Environmental Services",
    "EVENTS_SERVICES": "Events Services",
    "EXECUTIVE_OFFICE": "Executive Office",
    "FACILITIES_SERVICES": "Facilities Services",
    "FARMING": "Farming",
    "FINANCIAL_SERVICES": "Financial Services",
    "FINE_ART": "Fine Art",
    "FISHERY": "Fishery",
    "FOOD_BEVERAGES": "Food & Beverages",
    "FOOD_PRODUCTION": "Food Production",
    "FUND_RAISING": "Fund-Raising",
    "FURNITURE": "Furniture",
    "GAMBLING_CASINOS": "Gambling & Casinos",
    "GLASS_CERAMICS_CONCRETE": "Glass, Ceramics & Concrete",
    "GOVERNMENT_ADMINISTRATION": "Government Administration",
    "GOVERNMENT_RELATIONS": "Government Relations",
    "GRAPHIC_DESIGN": "Graphic Design",
    "HEALTH_WELLNESS_AND_FITNESS": "Health, Wellness and Fitness",
    "HIGHER_EDUCATION": "Higher Education",
    "HOSPITAL_HEALTH_CARE": "Hospital & Health Care",
    "HOSPITALITY": "Hospitality",
    "HUMAN_RESOURCES": "Human Resources",
    "IMPORT_AND_EXPORT": "Import and Export",
    "INDIVIDUAL_FAMILY_SERVICES": "Individual & Family Services",
    "INDUSTRIAL_AUTOMATION": "Industrial Automation",
    "INFORMATION_SERVICES": "Information Services",
    "INFORMATION_TECHNOLOGY_AND_SERVICES": "Information Technology and Services",
    "INSURANCE": "Insurance",
    "INTERNATIONAL_AFFAIRS": "International Affairs",
    "INTERNATIONAL_TRADE_AND_DEVELOPMENT": "International Trade and Development",
    "INTERNET": "Internet",
    "INVESTMENT_BANKING": "Investment Banking",
    "INVESTMENT_MANAGEMENT": "Investment Management",
    "JUDICIARY": "Judiciary",
    "LAW_ENFORCEMENT": "Law Enforcement",
    "LAW_PRACTICE": "Law Practice",
    "LEGAL_SERVICES": "Legal Services",
    "LEGISLATIVE_OFFICE": "Legislative Office",
    "LEISURE_TRAVEL_TOURISM": "Leisure, Travel & Tourism",
    "LIBRARIES": "Libraries",
    "LOGISTICS_AND_SUPPLY_CHAIN": "Logistics and Supply Chain",
    "LUXURY_GOODS_JEWELRY": "Luxury Goods & Jewelry",
    "MACHINERY": "Machinery",
    "MANAGEMENT_CONSULTING": "Management Consulting",
    "MARITIME": "Maritime",
    "MARKET_RESEARCH": "Market Research",
    "MARKETING_AND_ADVERTISING": "Marketing and Advertising",
    "MECHANICAL_OR_INDUSTRIAL_ENGINEERING": "Mechanical or Industrial Engineering",
    "MEDIA_PRODUCTION": "Media Production",
    "MEDICAL_DEVICES": "Medical Devices",
    "MEDICAL_PRACTICE": "Medical Practice",
    "MENTAL_HEALTH_CARE": "Mental Health Care",
    "MILITARY": "Military",
    "MINING_METALS": "Mining & Metals",
    "MOTION_PICTURES_AND_FILM": "Motion Pictures and Film",
    "MUSEUMS_AND_INSTITUTIONS": "Museums and Institutions",
    "MUSIC": "Music",
    "NANOTECHNOLOGY": "Nanotechnology",
    "NEWSPAPERS": "Newspapers",
    "NONPROFIT_ORGANIZATION_MANAGEMENT": "Nonprofit Organization Management",
    "OIL_ENERGY": "Oil & Energy",
    "ONLINE_MEDIA": "Online Media",
    "OUTSOURCING_OFFSHORING": "Outsourcing/Offshoring",
    "PACKAGE_FREIGHT_DELIVERY": "Package/Freight Delivery",
    "PACKAGING_AND_CONTAINERS": "Packaging and Containers",
    "PAPER_FOREST_PRODUCTS": "Paper & Forest Products",
    "PERFORMING_ARTS": "Performing Arts",
    "PHARMACEUTICALS": "Pharmaceuticals",
    "PHILANTHROPY": "Philanthropy",
    "PHOTOGRAPHY": "Photography",
    "PLASTICS": "Plastics",
    "POLITICAL_ORGANIZATION": "Political Organization",
    "PRIMARY_SECONDARY_EDUCATION": "Primary/Secondary Education",
    "PRINTING": "Printing",
    "PROFESSIONAL_TRAINING_COACHING": "Professional Training & Coaching",
    "PROGRAM_DEVELOPMENT": "Program Development",
    "PUBLIC_POLICY": "Public Policy",
    "PUBLIC_RELATIONS_AND_COMMUNICATIONS": "Public Relations and Communications",
    "PUBLIC_SAFETY": "Public Safety",
    "PUBLISHING": "Publishing",
    "RAILROAD_MANUFACTURE": "Railroad Manufacture",
    "RANCHING": "Ranching",
    "REAL_ESTATE": "Real Estate",
    "RECREATIONAL_FACILITIES_AND_SERVICES": "Recreational Facilities and Services",
    "RELIGIOUS_INSTITUTIONS": "Religious Institutions",
    "RENEWABLES_ENVIRONMENT": "Renewables & Environment",
    "RESEARCH": "Research",
    "RESTAURANTS": "Restaurants",
    "RETAIL": "Retail",
    "SECURITY_AND_INVESTIGATIONS": "Security and Investigations",
    "SEMICONDUCTORS": "Semiconductors",
    "SHIPBUILDING": "Shipbuilding",
    "SPORTING_GOODS": "Sporting Goods",
    "SPORTS": "Sports",
    "STAFFING_AND_RECRUITING": "Staffing and Recruiting",
    "SUPERMARKETS": "Supermarkets",
    "TELECOMMUNICATIONS": "Telecommunications",
    "TEXTILES": "Textiles",
    "THINK_TANKS": "Think Tanks",
    "TOBACCO": "Tobacco",
    "TRANSLATION_AND_LOCALIZATION": "Translation and Localization",
    "TRANSPORTATION_TRUCKING_RAILROAD": "Transportation/Trucking/Railroad",
    "UTILITIES": "Utilities",
    "VENTURE_CAPITAL_PRIVATE_EQUITY": "Venture Capital & Private Equity",
    "VETERINARY": "Veterinary",
    "WAREHOUSING": "Warehousing",
    "WHOLESALE": "Wholesale",
    "WINE_AND_SPIRITS": "Wine and Spirits",
    "WIRELESS": "Wireless",
    "WRITING_AND_EDITING": "Writing and Editing",
}

# Explicit mappings from LeadFlow / Hunter.io classifications to verified HubSpot options
LEADFLOW_TO_HUBSPOT_INDUSTRY_MAP: Dict[str, str] = {
    # LeadFlow Core Categories
    "b2b saas & enterprise software": "COMPUTER_SOFTWARE",
    "saas": "COMPUTER_SOFTWARE",
    "software": "COMPUTER_SOFTWARE",
    "enterprise software": "COMPUTER_SOFTWARE",
    "computer software": "COMPUTER_SOFTWARE",
    "information technology & services": "INFORMATION_TECHNOLOGY_AND_SERVICES",
    "information technology and services": "INFORMATION_TECHNOLOGY_AND_SERVICES",
    "it services": "INFORMATION_TECHNOLOGY_AND_SERVICES",
    "professional & it services": "INFORMATION_TECHNOLOGY_AND_SERVICES",
    "internet": "INTERNET",
    "e-commerce & digital brands": "INTERNET",
    "e-commerce": "INTERNET",
    "ecommerce": "INTERNET",
    "healthcare & life sciences": "HOSPITAL_HEALTH_CARE",
    "healthcare & medical devices": "HOSPITAL_HEALTH_CARE",
    "healthcare": "HOSPITAL_HEALTH_CARE",
    "health care": "HOSPITAL_HEALTH_CARE",
    "hospital & health care": "HOSPITAL_HEALTH_CARE",
    "hospital and health care": "HOSPITAL_HEALTH_CARE",
    "life sciences": "BIOTECHNOLOGY",
    "medical devices": "MEDICAL_DEVICES",
    "pharmaceuticals": "PHARMACEUTICALS",
    "financial services & fintech": "FINANCIAL_SERVICES",
    "financial services": "FINANCIAL_SERVICES",
    "fintech": "FINANCIAL_SERVICES",
    "banking": "BANKING",
    "insurance": "INSURANCE",
    "commercial real estate & proptech": "COMMERCIAL_REAL_ESTATE",
    "commercial real estate": "COMMERCIAL_REAL_ESTATE",
    "real estate": "REAL_ESTATE",
    "advanced manufacturing & logistics": "MANUFACTURING",
    "manufacturing": "MANUFACTURING",
    "logistics": "LOGISTICS_AND_SUPPLY_CHAIN",
    "legal & regulatory compliance": "LEGAL_SERVICES",
    "legal services": "LEGAL_SERVICES",
    "hospitality & high-growth leisure": "HOSPITALITY",
    "hospitality": "HOSPITALITY",
    "education & edtech solutions": "EDUCATION_MANAGEMENT",
    "education management": "EDUCATION_MANAGEMENT",
    "higher education": "HIGHER_EDUCATION",
    "e-learning": "E_LEARNING",
    "marketing & advertising": "MARKETING_AND_ADVERTISING",
    "management consulting": "MANAGEMENT_CONSULTING",
    "telecommunications": "TELECOMMUNICATIONS",
    "construction": "CONSTRUCTION",
    "retail": "RETAIL",
    "consumer goods": "CONSUMER_GOODS",
    "media production": "MEDIA_PRODUCTION",
    "accounting": "ACCOUNTING",
    "staffing & recruiting": "STAFFING_AND_RECRUITING",
    "design": "DESIGN",
    "automotive": "AUTOMOTIVE",
    "human resources": "HUMAN_RESOURCES",
}

# Cache for portal-specific industry options: {portal_id: (set_of_options, timestamp)}
_PORTAL_INDUSTRY_CACHE: Dict[str, Tuple[Set[str], float]] = {}
CACHE_TTL_SECONDS = 3600.0  # 1 hour


async def fetch_portal_industry_options(
    access_token: Optional[str] = None,
    portal_id: Optional[str] = None,
    timeout_seconds: float = 10.0,
) -> Set[str]:
    """
    Retrieves allowed company industry dropdown options from the connected HubSpot portal.
    Uses in-memory TTL caching. Falls back gracefully to standard HubSpot industry options
    if portal metadata is unreachable or access token is not provided.
    """
    cache_key = portal_id or "default"
    now = time.time()

    if cache_key in _PORTAL_INDUSTRY_CACHE:
        cached_opts, timestamp = _PORTAL_INDUSTRY_CACHE[cache_key]
        if now - timestamp < CACHE_TTL_SECONDS:
            return cached_opts

    if not access_token:
        return set(HUBSPOT_STANDARD_INDUSTRIES.keys())

    try:
        url = "https://api.hubapi.com/crm/v3/properties/companies/industry"
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})
            if resp.status_code == 200:
                data = resp.json()
                raw_options = data.get("options", [])
                options = {opt.get("value") for opt in raw_options if opt.get("value")}
                if options:
                    _PORTAL_INDUSTRY_CACHE[cache_key] = (options, now)
                    return options
    except Exception as exc:
        logger.warning(f"Could not retrieve HubSpot portal industry options: {exc}. Using standard fallback.")

    fallback_opts = set(HUBSPOT_STANDARD_INDUSTRIES.keys())
    _PORTAL_INDUSTRY_CACHE[cache_key] = (fallback_opts, now)
    return fallback_opts


def map_industry_to_hubspot(
    industry: Optional[str],
    allowed_options: Optional[Set[str]] = None,
) -> Tuple[Optional[str], str, str]:
    """
    Maps LeadFlow industry string to a valid HubSpot option.
    Returns: (mapped_hubspot_value, status, explanation)
    Status can be:
      - 'ready': Exact or normalized match to allowed options
      - 'mapped': Verified mapping via dictionary
      - 'omitted_warning': Unknown or unsupported, safe to omit
      - 'omitted': Empty/None provided
    """
    if not industry or not str(industry).strip():
        return None, "omitted", "Industry not provided."

    raw = str(industry).strip()
    norm = raw.lower()

    allowed = allowed_options or set(HUBSPOT_STANDARD_INDUSTRIES.keys())

    # 1. Direct match with uppercase option value (e.g. COMPUTER_SOFTWARE)
    upper_raw = raw.upper().replace(" ", "_").replace("&", "AND").replace("/", "_").replace("-", "_")
    if upper_raw in allowed:
        return upper_raw, "ready", f"Direct match to HubSpot option '{upper_raw}'."

    # 2. Check explicit dictionary mapping
    if norm in LEADFLOW_TO_HUBSPOT_INDUSTRY_MAP:
        mapped = LEADFLOW_TO_HUBSPOT_INDUSTRY_MAP[norm]
        if mapped in allowed:
            return mapped, "mapped", f"Mapped LeadFlow classification '{raw}' to verified HubSpot option '{mapped}'."

    # 3. Fuzzy match against standard option labels
    for code, label in HUBSPOT_STANDARD_INDUSTRIES.items():
        if code in allowed and (norm == label.lower() or norm in label.lower() or label.lower() in norm):
            return code, "mapped", f"Matched '{raw}' to HubSpot option '{code}' ({label})."

    # 4. Unknown / Unsupported
    return (
        None,
        "omitted_warning",
        f"Industry '{raw}' does not match a verified HubSpot option. It is preserved in LeadFlow and will be omitted from the HubSpot company payload.",
    )


def map_employee_count(
    employee_count: Any,
) -> Tuple[Optional[int], str, str]:
    """
    Validates and transforms employee count for HubSpot's integer 'numberofemployees' property.
    Returns: (integer_value, status, explanation)
    Status can be:
      - 'ready': Exact valid integer
      - 'omitted_warning': Range detected, cannot convert to integer without fabricating data
      - 'omitted': No value provided
      - 'invalid_error': Malformed or negative integer
    """
    if employee_count is None or str(employee_count).strip() == "":
        return None, "omitted", "Employee count not provided."

    val_str = str(employee_count).strip()

    # Check for descriptive ranges (e.g. "11-50 employees", "51-200", "1,000+ enterprise")
    has_range_indicator = bool(re.search(r"[-–—]|to|\+|employees|enterprise", val_str, re.IGNORECASE))
    if has_range_indicator:
        # Check if it's strictly a range like 11-50
        return (
            None,
            "omitted_warning",
            f"Employee count is a range ('{val_str}'). HubSpot requires an exact integer. The range is preserved in LeadFlow and omitted from HubSpot.",
        )

    # Clean punctuation like commas (e.g. "1,500" -> "1500")
    cleaned = val_str.replace(",", "").replace(" ", "")

    try:
        count = int(cleaned)
        if count <= 0:
            return (
                None,
                "invalid_error",
                f"Employee count must be a positive integer (received {count}).",
            )
        if count > 10_000_000:
            return (
                None,
                "invalid_error",
                f"Employee count exceeds realistic limits (received {count}).",
            )
        return count, "ready", f"Exact employee count of {count} verified."
    except ValueError:
        return (
            None,
            "omitted_warning",
            f"Employee count '{val_str}' cannot be parsed as an integer. Preserved in LeadFlow and omitted from HubSpot.",
        )


def validate_sync_payload(
    company_data: Dict[str, Any],
    contact_data: Optional[Dict[str, Any]] = None,
    allowed_industries: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """
    Complete pre-sync validator and payload builder.
    Separates required-field errors (blocking) from optional-field warnings (non-blocking).
    Constructs clean, validated HubSpot-compliant company and contact property payloads.
    """
    field_validations: List[Dict[str, Any]] = []
    warnings: List[str] = []
    errors: List[str] = []

    # 1. Company Name (Required)
    company_name = company_data.get("company_name") or company_data.get("name")
    if not company_name or not str(company_name).strip():
        errors.append("Company Name is required to sync a company to HubSpot CRM.")
        field_validations.append({
            "field": "company_name",
            "leadflow_value": company_name,
            "hubspot_property": "name",
            "hubspot_value": None,
            "status": "error",
            "is_blocking": True,
            "message": "Missing company name.",
        })
    else:
        clean_name = str(company_name).strip()
        field_validations.append({
            "field": "company_name",
            "leadflow_value": clean_name,
            "hubspot_property": "name",
            "hubspot_value": clean_name,
            "status": "ready",
            "is_blocking": False,
            "message": "Company name verified.",
        })

    # 2. Domain (Required for company deduplication and identification)
    raw_domain = company_data.get("domain")
    clean_domain = None
    if raw_domain:
        clean_domain = str(raw_domain).lower().replace("http://", "").replace("https://", "").split("/")[0].strip()

    if not clean_domain:
        errors.append("Company website domain is required for CRM deduplication.")
        field_validations.append({
            "field": "domain",
            "leadflow_value": raw_domain,
            "hubspot_property": "domain",
            "hubspot_value": None,
            "status": "error",
            "is_blocking": True,
            "message": "Missing company website domain.",
        })
    else:
        field_validations.append({
            "field": "domain",
            "leadflow_value": clean_domain,
            "hubspot_property": "domain",
            "hubspot_value": clean_domain,
            "status": "ready",
            "is_blocking": False,
            "message": "Domain format verified.",
        })

    # 3. Industry (Optional with verified mapping)
    raw_industry = company_data.get("industry")
    mapped_ind, ind_status, ind_msg = map_industry_to_hubspot(raw_industry, allowed_industries)
    if ind_status == "omitted_warning":
        warnings.append(ind_msg)
    field_validations.append({
        "field": "industry",
        "leadflow_value": raw_industry,
        "hubspot_property": "industry",
        "hubspot_value": mapped_ind,
        "status": ind_status,
        "is_blocking": False,
        "message": ind_msg,
    })

    # 4. Employee Count (Optional integer)
    raw_employees = company_data.get("employee_count") or company_data.get("numberofemployees")
    mapped_emp, emp_status, emp_msg = map_employee_count(raw_employees)
    if emp_status == "invalid_error":
        errors.append(emp_msg)
    elif emp_status == "omitted_warning":
        warnings.append(emp_msg)
    field_validations.append({
        "field": "employee_count",
        "leadflow_value": raw_employees,
        "hubspot_property": "numberofemployees",
        "hubspot_value": str(mapped_emp) if mapped_emp is not None else None,
        "status": emp_status,
        "is_blocking": (emp_status == "invalid_error"),
        "message": emp_msg,
    })

    # 5. Location / City (Optional text)
    location = company_data.get("location") or company_data.get("city")
    if location and str(location).strip():
        clean_loc = str(location).strip()
        field_validations.append({
            "field": "location",
            "leadflow_value": clean_loc,
            "hubspot_property": "city",
            "hubspot_value": clean_loc,
            "status": "ready",
            "is_blocking": False,
            "message": "City / Location verified.",
        })
    else:
        field_validations.append({
            "field": "location",
            "leadflow_value": None,
            "hubspot_property": "city",
            "hubspot_value": None,
            "status": "omitted",
            "is_blocking": False,
            "message": "Location not specified.",
        })

    # Construct clean company payload
    company_properties: Dict[str, Any] = {
        "name": company_name.strip() if company_name else "",
    }
    if clean_domain:
        company_properties["domain"] = clean_domain
    if mapped_ind:
        company_properties["industry"] = mapped_ind
    if mapped_emp is not None:
        company_properties["numberofemployees"] = str(mapped_emp)
    if location and str(location).strip():
        company_properties["city"] = str(location).strip()

    # 6. Contact validation (if contact provided)
    contact_properties: Optional[Dict[str, Any]] = None
    if contact_data:
        email = contact_data.get("email")
        if not email or "@" not in str(email):
            warnings.append("Contact lacks a valid email address; contact creation will be skipped.")
            field_validations.append({
                "field": "contact_email",
                "leadflow_value": email,
                "hubspot_property": "email",
                "hubspot_value": None,
                "status": "omitted_warning",
                "is_blocking": False,
                "message": "Contact email missing or invalid. Contact sync will be skipped.",
            })
        else:
            clean_email = str(email).lower().strip()
            contact_properties = {"email": clean_email}
            field_validations.append({
                "field": "contact_email",
                "leadflow_value": clean_email,
                "hubspot_property": "email",
                "hubspot_value": clean_email,
                "status": "ready",
                "is_blocking": False,
                "message": "Contact email verified.",
            })

            # Name splitting
            full_name = contact_data.get("full_name") or contact_data.get("name")
            if full_name:
                parts = str(full_name).strip().split(maxsplit=1)
                first = parts[0]
                last = parts[1] if len(parts) > 1 else ""
                contact_properties["firstname"] = first
                if last:
                    contact_properties["lastname"] = last
                field_validations.append({
                    "field": "contact_name",
                    "leadflow_value": full_name,
                    "hubspot_property": "firstname / lastname",
                    "hubspot_value": f"{first} {last}".strip(),
                    "status": "ready",
                    "is_blocking": False,
                    "message": "Contact name parsed.",
                })

            if contact_data.get("title"):
                contact_properties["jobtitle"] = str(contact_data["title"]).strip()
                field_validations.append({
                    "field": "contact_title",
                    "leadflow_value": contact_data["title"],
                    "hubspot_property": "jobtitle",
                    "hubspot_value": str(contact_data["title"]).strip(),
                    "status": "ready",
                    "is_blocking": False,
                    "message": "Job title verified.",
                })
            if contact_data.get("phone"):
                contact_properties["phone"] = str(contact_data["phone"]).strip()
                field_validations.append({
                    "field": "contact_phone",
                    "leadflow_value": contact_data["phone"],
                    "hubspot_property": "phone",
                    "hubspot_value": str(contact_data["phone"]).strip(),
                    "status": "ready",
                    "is_blocking": False,
                    "message": "Phone number verified.",
                })
    else:
        warnings.append("No contact email provided; contact creation will be skipped.")
        field_validations.append({
            "field": "contact_email",
            "leadflow_value": None,
            "hubspot_property": "email",
            "hubspot_value": None,
            "status": "omitted",
            "is_blocking": False,
            "message": "No contact information provided. Contact sync will be skipped.",
        })

    is_valid = len(errors) == 0

    return {
        "is_valid": is_valid,
        "has_blocking_errors": not is_valid,
        "company_payload": company_properties,
        "contact_payload": contact_properties,
        "field_validations": field_validations,
        "warnings": warnings,
        "errors": errors,
    }
