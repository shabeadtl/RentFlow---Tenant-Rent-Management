"""
CRUD routes for Payments.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from app.config import get_supabase_client
from app.models import AuthUserOut, PaymentCreate, PaymentOut, PaymentUpdate
from app.services.auth import get_current_user, require_manager_or_admin
from app.services.validation import (
    ensure_non_empty_text,
    ensure_unique_payment_for_month,
    get_payment_or_404,
    get_tenant_or_404,
    normalize_optional_text,
)

router = APIRouter(prefix="/api/payments", tags=["Payments"])

TABLE = "payments"


def _is_missing_note_column_error(exc: APIError) -> bool:
    message = getattr(exc, "message", "") or ""
    code = getattr(exc, "code", "") or ""
    return code == "PGRST204" and "'note' column" in message and "'payments'" in message


def _is_missing_payment_type_column_error(exc: APIError) -> bool:
    message = getattr(exc, "message", "") or ""
    code = getattr(exc, "code", "") or ""
    return code == "PGRST204" and "'payment_type' column" in message and "'payments'" in message


def _is_duplicate_payment_error(exc: APIError) -> bool:
    message = getattr(exc, "message", "") or ""
    code = getattr(exc, "code", "") or ""
    return code == "23505" and "tenant_id" in message and "month_covered" in message


def _note_requires_migration(data: dict) -> bool:
    return data.get("note") is not None


def _payment_type_requires_migration(data: dict) -> bool:
    return data.get("payment_type", "rent") != "rent"


def _normalize_payment_payload(data: dict) -> dict:
    if "tenant_id" in data and data["tenant_id"] is not None:
        data["tenant_id"] = ensure_non_empty_text(data["tenant_id"], "Tenant")
    if "month_covered" in data and data["month_covered"] is not None:
        data["month_covered"] = ensure_non_empty_text(data["month_covered"], "Month covered")
    if "payment_type" in data and data["payment_type"] is not None:
        data["payment_type"] = ensure_non_empty_text(data["payment_type"], "Payment type").lower()
    if "note" in data:
        data["note"] = normalize_optional_text(data.get("note"))
    return data


def _insert_or_update_payment(sb, data: dict, payment_id: str | None = None):
    operation = sb.table(TABLE).insert(data) if payment_id is None else sb.table(TABLE).update(data).eq("id", payment_id)
    try:
        return operation.execute()
    except APIError as exc:
        if _is_duplicate_payment_error(exc):
            raise HTTPException(
                status_code=409,
                detail="A payment for this tenant and month already exists.",
            ) from exc

        if _is_missing_payment_type_column_error(exc) and "payment_type" in data:
            if _payment_type_requires_migration(data):
                raise HTTPException(
                    status_code=409,
                    detail="Advance payments require the database migration before they can be saved.",
                ) from exc
            fallback_data = {key: value for key, value in data.items() if key != "payment_type"}
            return _insert_or_update_payment(sb, fallback_data, payment_id)

        if _is_missing_note_column_error(exc) and "note" in data:
            if _note_requires_migration(data):
                raise HTTPException(
                    status_code=409,
                    detail="Payment notes require the database migration before they can be saved.",
                ) from exc
            fallback_data = {key: value for key, value in data.items() if key != "note"}
            return _insert_or_update_payment(sb, fallback_data, payment_id)

        raise


@router.get("/", response_model=list[PaymentOut])
async def list_payments(
    tenant_id: str | None = Query(default=None),
    month_covered: str | None = Query(default=None),
    _: AuthUserOut = Depends(get_current_user),
):
    """Return all payments, optionally filtered by tenant or month."""
    sb = get_supabase_client()
    query = sb.table(TABLE).select("*")
    if tenant_id:
        query = query.eq("tenant_id", tenant_id)
    if month_covered:
        query = query.eq("month_covered", month_covered)
    result = query.order("payment_date", desc=True).execute()
    return result.data


@router.get("/{payment_id}", response_model=PaymentOut)
async def get_payment(payment_id: str, _: AuthUserOut = Depends(get_current_user)):
    """Return a single payment by ID."""
    sb = get_supabase_client()
    return get_payment_or_404(sb, payment_id)


@router.post("/", response_model=PaymentOut, status_code=201)
async def create_payment(
    payload: PaymentCreate,
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Record a new payment."""
    sb = get_supabase_client()
    data = _normalize_payment_payload(payload.model_dump(exclude_none=True))
    get_tenant_or_404(sb, data["tenant_id"])
    ensure_unique_payment_for_month(sb, data["tenant_id"], data["month_covered"])
    if data.get("payment_date"):
        data["payment_date"] = data["payment_date"].isoformat()
    result = _insert_or_update_payment(sb, data)
    return result.data[0]


@router.put("/{payment_id}", response_model=PaymentOut)
async def update_payment(
    payment_id: str,
    payload: PaymentUpdate,
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Update an existing payment."""
    sb = get_supabase_client()
    existing = get_payment_or_404(sb, payment_id)
    data = _normalize_payment_payload(payload.model_dump(exclude_none=True))
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    new_tenant_id = data.get("tenant_id", existing["tenant_id"])
    new_month_covered = data.get("month_covered", existing["month_covered"])
    get_tenant_or_404(sb, new_tenant_id)
    ensure_unique_payment_for_month(
        sb,
        new_tenant_id,
        new_month_covered,
        exclude_payment_id=payment_id,
    )
    if data.get("payment_date"):
        data["payment_date"] = data["payment_date"].isoformat()
    result = _insert_or_update_payment(sb, data, payment_id)
    if not result.data:
        raise HTTPException(status_code=404, detail="Payment not found")
    return result.data[0]


@router.delete("/{payment_id}", status_code=204)
async def delete_payment(
    payment_id: str,
    _: AuthUserOut = Depends(require_manager_or_admin),
):
    """Delete a payment."""
    sb = get_supabase_client()
    sb.table(TABLE).delete().eq("id", payment_id).execute()
    return None
