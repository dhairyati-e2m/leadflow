import io
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db_session
from backend.app.core.deps import TenantContext, get_tenant_context, require_role
from backend.app.domain.ingestion.csv_parser import parse_leads_csv
from backend.app.repositories.leads import LeadRepository
from backend.app.repositories.searches import SearchRepository

router = APIRouter()

MAX_CSV_BYTES = 5 * 1024 * 1024  # 5MB upload limit


class CSVIngestResponse(BaseModel):
    search_id: str
    filename: str
    total_rows_parsed: int
    imported_count: int
    duplicate_count: int
    file_duplicates: int
    errors: List[Dict[str, Any]]


class SearchBatchSummary(BaseModel):
    id: str
    name: str
    source_type: str
    status: str
    total_leads: int
    created_at: str


@router.post(
    "/csv",
    response_model=CSVIngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest leads via CSV file with formula-injection guard and deduplication",
)
async def upload_leads_csv(
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_role(["owner", "admin", "analyst"])),
    session: AsyncSession = Depends(get_db_session),
) -> CSVIngestResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only .csv files are supported.",
        )

    # Read uploaded bytes with size enforcement
    contents = await file.read(MAX_CSV_BYTES + 1)
    if len(contents) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum upload size limit of {MAX_CSV_BYTES // (1024 * 1024)}MB.",
        )

    # Safely decode content
    try:
        csv_text = contents.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_text = contents.decode("latin-1")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to decode CSV file. Please ensure file is UTF-8 encoded.",
            )

    # Parse and sanitize CSV content
    parse_result = parse_leads_csv(csv_text)

    if not parse_result.valid_leads and parse_result.errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"CSV parsing error: {parse_result.errors[0].get('error', 'Malformed CSV')}",
        )

    lead_repo = LeadRepository(session, ctx.org_id)
    search_repo = SearchRepository(session, ctx.org_id)

    # Record search/batch record
    search = await search_repo.create_search(
        name=file.filename,
        source_type="csv",
        total_leads=len(parse_result.valid_leads),
        metadata_json={
            "filename": file.filename,
            "total_rows": parse_result.total_rows,
            "file_duplicates": parse_result.duplicates_in_file,
        },
    )

    # Bulk insert unique leads into PostgreSQL, skipping existing tenant domains
    imported_count, duplicate_count, created = await lead_repo.bulk_create_leads(
        parsed_rows=parse_result.valid_leads,
        search_id=search.id,
    )

    await session.commit()

    return CSVIngestResponse(
        search_id=search.id,
        filename=file.filename,
        total_rows_parsed=parse_result.total_rows,
        imported_count=imported_count,
        duplicate_count=duplicate_count,
        file_duplicates=parse_result.duplicates_in_file,
        errors=parse_result.errors,
    )


@router.get(
    "/searches",
    response_model=List[SearchBatchSummary],
    summary="List past CSV ingestion batches for the current organization",
)
async def list_searches(
    ctx: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_db_session),
) -> List[SearchBatchSummary]:
    search_repo = SearchRepository(session, ctx.org_id)
    searches = await search_repo.list_searches(limit=50)
    return [
        SearchBatchSummary(
            id=s.id,
            name=s.name,
            source_type=s.source_type,
            status=s.status,
            total_leads=s.total_leads,
            created_at=s.created_at.isoformat() if s.created_at else "",
        )
        for s in searches
    ]
