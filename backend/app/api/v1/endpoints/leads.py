from typing import Any, Dict
from fastapi import APIRouter, File, HTTPException, UploadFile
from backend.app.domain.ingestion.csv_parser import CSVImportResult, parse_leads_csv

router = APIRouter()


@router.post("/import-csv", response_model=CSVImportResult, summary="Parse and Validate Leads CSV")
async def import_leads_csv(
    file: UploadFile = File(...),
) -> CSVImportResult:
    """
    Validates uploaded CSV file, protects against formula injection,
    normalizes domains, and deduplicates records.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a .csv file.")

    contents = await file.read()
    try:
        decoded = contents.decode("utf-8-sig")  # Handles UTF-8 BOM if present
    except UnicodeDecodeError:
        try:
            decoded = contents.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Unable to decode CSV file encoding.")

    return parse_leads_csv(decoded)
