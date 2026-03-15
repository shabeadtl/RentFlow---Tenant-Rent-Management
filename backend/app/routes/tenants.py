"""
CRUD routes for Tenants.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from postgrest.exceptions import APIError
from app.config import get_supabase_client
from app.models import AuthUserOut, TenantCreate, TenantOut, TenantUpdate
from app.services.auth import get_current_user, require_manager_or_admin
from app.services.tenant_documents import attach_tenant_documents, delete_tenant_document, save_tenant_document
from app.services.validation import (
    ensure_non_empty_text,
    ensure_property_capacity,
    ensure_unit_available,
    ensure_valid_lease_dates,
    get_tenant_or_404,
    normalize_optional_text,
)

router = APIRouter(prefix="/api/tenants", tags=["Tenants"])

TABLE = "tenants"
DOCUMENT_FIELD_MAP = {
    "agreement": ("agreement_file_name", "agreement_file_url"),
    "proof": ("proof_file_name", "proof_file_url"),
}
TENANT_DOCUMENT_COLUMNS = {
    "agreement_file_name",
    "agreement_file_url",
    "proof_file_name",
    "proof_file_url",
}


def _is_duplicate_active_unit_error(exc: APIError) -> bool:
    message = getattr(exc, "message", "") or ""
    code = getattr(exc, "code", "") or ""
    return code == "23505" and "idx_tenants_active_unit" in message


def _get_missing_tenant_column(exc: APIError) -> str | None:
    message = getattr(exc, "message", "") or ""
    code = getattr(exc, "code", "") or ""
    if code != "PGRST204" or "'tenants'" not in message or "column" not in message:
        return None

    marker = "Could not find the '"
    if marker not in message:
        return None
    column_name = message.split(marker, 1)[1].split("' column", 1)[0]
    return column_name or None


def _tenant_column_requires_migration(column_name: str) -> bool:
    return column_name in TENANT_DOCUMENT_COLUMNS or column_name == "rent_due_day"


def _can_retry_without_tenant_column(data: dict, column_name: str) -> bool:
    if column_name == "rent_due_day":
        return data.get("rent_due_day") in {None, 1}
    return False


def _tenant_migration_message(column_name: str) -> str:
    if column_name == "rent_due_day":
        return "Custom rent due days require the database migration before they can be saved."
    if column_name in TENANT_DOCUMENT_COLUMNS:
        return "Tenant document support requires the database migration before documents can be saved."
    return "This tenant feature requires the latest database migration."


@router.get("/", response_model=list[TenantOut])
async def list_tenants(
    property_id: str | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(active|past)$"),
    _: AuthUserOut = Depends(get_current_user),
):
    """Return all tenants, optionally filtered by property or status."""
    sb = get_supabase_client()
    query = sb.table(TABLE).select("*")
    if property_id:
        query = query.eq("property_id", property_id)
    if status:
        query = query.eq("status", status)
    result = query.execute()
    return [attach_tenant_documents(row) for row in result.data]


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: str, _: AuthUserOut = Depends(get_current_user)):
    """Return a single tenant by ID."""
    sb = get_supabase_client()
    return attach_tenant_documents(get_tenant_or_404(sb, tenant_id))


@router.post("/{tenant_id}/documents", response_model=TenantOut)
async def upload_tenant_documents(
    tenant_id: str,
    agreement: UploadFile | None = File(default=None),
    proof: UploadFile | None = File(default=None),
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Upload or replace tenant agreement/proof documents."""
    if agreement is None and proof is None:
        raise HTTPException(status_code=400, detail="Attach at least one document to upload.")

    sb = get_supabase_client()
    existing = get_tenant_or_404(sb, tenant_id)
    update_payload = {}

    if agreement is not None:
        stored = await save_tenant_document(
            tenant_id,
            "agreement",
            agreement,
            existing_file_url=existing.get("agreement_file_url"),
        )
        update_payload["agreement_file_name"] = stored["file_name"]
        update_payload["agreement_file_url"] = stored["file_url"]

    if proof is not None:
        stored = await save_tenant_document(
            tenant_id,
            "proof",
            proof,
            existing_file_url=existing.get("proof_file_url"),
        )
        update_payload["proof_file_name"] = stored["file_name"]
        update_payload["proof_file_url"] = stored["file_url"]

    try:
        result = sb.table(TABLE).update(update_payload).eq("id", tenant_id).execute()
    except APIError as exc:
        missing_column = _get_missing_tenant_column(exc)
        if missing_column and missing_column in TENANT_DOCUMENT_COLUMNS:
            fallback_tenant = dict(existing)
            fallback_tenant.update(update_payload)
            return attach_tenant_documents(fallback_tenant)
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return attach_tenant_documents(result.data[0])


@router.delete("/{tenant_id}/documents/{document_kind}", response_model=TenantOut)
async def delete_tenant_document(
    tenant_id: str,
    document_kind: str,
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Remove an uploaded tenant document."""
    fields = DOCUMENT_FIELD_MAP.get(document_kind)
    if fields is None:
        raise HTTPException(status_code=400, detail="Unknown tenant document type.")

    sb = get_supabase_client()
    existing = get_tenant_or_404(sb, tenant_id)
    name_field, url_field = fields
    delete_tenant_document(tenant_id, document_kind, existing.get(url_field))
    try:
        result = (
            sb.table(TABLE)
            .update({name_field: None, url_field: None})
            .eq("id", tenant_id)
            .execute()
        )
    except APIError as exc:
        missing_column = _get_missing_tenant_column(exc)
        if missing_column and missing_column in TENANT_DOCUMENT_COLUMNS:
            fallback_tenant = dict(existing)
            fallback_tenant[name_field] = None
            fallback_tenant[url_field] = None
            return attach_tenant_documents(fallback_tenant)
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return attach_tenant_documents(result.data[0])


@router.post("/", response_model=TenantOut, status_code=201)
async def create_tenant(
    payload: TenantCreate,
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Create a new tenant."""
    sb = get_supabase_client()
    data = payload.model_dump()
    data["name"] = ensure_non_empty_text(data.get("name"), "Tenant name")
    data["property_id"] = ensure_non_empty_text(data.get("property_id"), "Property")
    data["email"] = normalize_optional_text(data.get("email"))
    data["phone"] = normalize_optional_text(data.get("phone"))
    data["unit_number"] = normalize_optional_text(data.get("unit_number"))
    data["electric_meter_reading"] = normalize_optional_text(data.get("electric_meter_reading"))
    data["final_meter_reading"] = normalize_optional_text(data.get("final_meter_reading"))
    ensure_valid_lease_dates(data.get("lease_start"), data.get("lease_end"))
    ensure_property_capacity(sb, data["property_id"], data["status"])
    ensure_unit_available(sb, data["property_id"], data["unit_number"], data["status"])
    # Convert date fields to ISO strings for JSON serialization
    for key in ("lease_start", "lease_end", "vacating_date"):
        if data.get(key):
            data[key] = data[key].isoformat()
    try:
        result = sb.table(TABLE).insert(data).execute()
    except APIError as exc:
        if _is_duplicate_active_unit_error(exc):
            raise HTTPException(
                status_code=409,
                detail=f"Unit {data['unit_number']} is already occupied by another active tenant.",
            ) from exc
        missing_column = _get_missing_tenant_column(exc)
        if missing_column and missing_column in data:
            if _can_retry_without_tenant_column(data, missing_column):
                fallback_data = {key: value for key, value in data.items() if key != missing_column}
                result = sb.table(TABLE).insert(fallback_data).execute()
            elif _tenant_column_requires_migration(missing_column):
                raise HTTPException(
                    status_code=409,
                    detail=_tenant_migration_message(missing_column),
                ) from exc
            else:
                raise
        else:
            raise
    return attach_tenant_documents(result.data[0])


@router.put("/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Update an existing tenant."""
    sb = get_supabase_client()
    existing = get_tenant_or_404(sb, tenant_id)
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "name" in data:
        data["name"] = ensure_non_empty_text(data.get("name"), "Tenant name")
    if "property_id" in data:
        data["property_id"] = ensure_non_empty_text(data.get("property_id"), "Property")
    for key in ("email", "phone", "unit_number", "electric_meter_reading", "final_meter_reading"):
        if key in data:
            data[key] = normalize_optional_text(data.get(key))

    new_property_id = data.get("property_id", existing["property_id"])
    new_status = data.get("status", existing["status"])
    new_unit_number = data.get("unit_number", existing.get("unit_number"))
    new_lease_start = data.get("lease_start", existing.get("lease_start"))
    new_lease_end = data.get("lease_end", existing.get("lease_end"))

    ensure_valid_lease_dates(new_lease_start, new_lease_end)
    ensure_property_capacity(sb, new_property_id, new_status, exclude_tenant_id=tenant_id)
    ensure_unit_available(
        sb,
        new_property_id,
        new_unit_number,
        new_status,
        exclude_tenant_id=tenant_id,
    )

    for key in ("lease_start", "lease_end", "vacating_date"):
        if data.get(key):
            data[key] = data[key].isoformat()
    try:
        result = (
            sb.table(TABLE).update(data).eq("id", tenant_id).execute()
        )
    except APIError as exc:
        if _is_duplicate_active_unit_error(exc):
            raise HTTPException(
                status_code=409,
                detail=f"Unit {new_unit_number} is already occupied by another active tenant.",
            ) from exc
        missing_column = _get_missing_tenant_column(exc)
        if missing_column and missing_column in data:
            if _can_retry_without_tenant_column(data, missing_column):
                fallback_data = {key: value for key, value in data.items() if key != missing_column}
                result = (
                    sb.table(TABLE).update(fallback_data).eq("id", tenant_id).execute()
                )
            elif _tenant_column_requires_migration(missing_column):
                raise HTTPException(
                    status_code=409,
                    detail=_tenant_migration_message(missing_column),
                ) from exc
            else:
                raise
        else:
            raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return attach_tenant_documents(result.data[0])


@router.delete("/{tenant_id}", status_code=204)
async def delete_tenant(
    tenant_id: str,
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Delete a tenant."""
    sb = get_supabase_client()
    existing = get_tenant_or_404(sb, tenant_id)
    delete_tenant_document(tenant_id, "agreement", existing.get("agreement_file_url"))
    delete_tenant_document(tenant_id, "proof", existing.get("proof_file_url"))
    sb.table(TABLE).delete().eq("id", tenant_id).execute()
    return None
