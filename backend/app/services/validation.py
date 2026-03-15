"""
Validation helpers for business rules that should be enforced server-side.
"""

from datetime import date

from fastapi import HTTPException


def get_property_or_404(sb, property_id: str) -> dict:
    result = sb.table("properties").select("*").eq("id", property_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Property not found")
    return result.data[0]


def get_tenant_or_404(sb, tenant_id: str) -> dict:
    result = sb.table("tenants").select("*").eq("id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return result.data[0]


def get_payment_or_404(sb, payment_id: str) -> dict:
    result = sb.table("payments").select("*").eq("id", payment_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Payment not found")
    return result.data[0]


def ensure_non_empty_text(value: str | None, field_name: str) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail=f"{field_name} cannot be empty")
    return trimmed


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _coerce_date(value: date | str | None) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


def ensure_valid_lease_dates(lease_start: date | str | None, lease_end: date | str | None) -> None:
    lease_start = _coerce_date(lease_start)
    lease_end = _coerce_date(lease_end)
    if lease_start and lease_end and lease_end < lease_start:
        raise HTTPException(
            status_code=400,
            detail="Lease end date cannot be earlier than lease start date.",
        )


def ensure_property_capacity(
    sb,
    property_id: str,
    tenant_status: str,
    exclude_tenant_id: str | None = None,
) -> dict:
    property_row = get_property_or_404(sb, property_id)

    if tenant_status != "active":
        return property_row

    query = sb.table("tenants").select("id").eq("property_id", property_id).eq("status", "active")
    if exclude_tenant_id:
        query = query.neq("id", exclude_tenant_id)
    occupied_units = len(query.execute().data)
    total_units = int(property_row["total_units"])

    if occupied_units >= total_units:
        raise HTTPException(
            status_code=409,
            detail="This property has no available units for another active tenant.",
        )

    return property_row


def ensure_unit_available(
    sb,
    property_id: str,
    unit_number: str | None,
    tenant_status: str,
    exclude_tenant_id: str | None = None,
) -> None:
    if tenant_status != "active" or not unit_number:
        return

    query = (
        sb.table("tenants")
        .select("id")
        .eq("property_id", property_id)
        .eq("status", "active")
        .eq("unit_number", unit_number)
    )
    if exclude_tenant_id:
        query = query.neq("id", exclude_tenant_id)

    if query.execute().data:
        raise HTTPException(
            status_code=409,
            detail=f"Unit {unit_number} is already occupied by another active tenant.",
        )


def ensure_property_units_not_below_active_tenants(
    sb,
    property_id: str,
    total_units: int,
) -> None:
    query = sb.table("tenants").select("id").eq("property_id", property_id).eq("status", "active")
    active_tenants = len(query.execute().data)
    if total_units < active_tenants:
        raise HTTPException(
            status_code=409,
            detail=f"Total units cannot be less than the current {active_tenants} active tenant(s).",
        )


def ensure_unique_payment_for_month(
    sb,
    tenant_id: str,
    month_covered: str,
    exclude_payment_id: str | None = None,
) -> None:
    query = sb.table("payments").select("id").eq("tenant_id", tenant_id).eq("month_covered", month_covered)
    if exclude_payment_id:
        query = query.neq("id", exclude_payment_id)

    if query.execute().data:
        raise HTTPException(
            status_code=409,
            detail="A payment for this tenant and month already exists.",
        )
