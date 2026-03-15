"""
Revenue calculation service.
Calculates "Total Revenue Collected" by joining Tenants and Payments data.
"""

from typing import Optional
from app.config import get_supabase_client
from app.models import RevenueResponse


def calculate_total_revenue(
    property_id: Optional[str] = None,
    month: Optional[str] = None,
) -> RevenueResponse:
    """
    Calculate total revenue collected by querying payments joined with tenants.

    This function uses a Supabase foreign-key join:
      payments → tenant_id → tenants → property_id → properties

    Args:
        property_id: Optional filter — only include payments for tenants
                     belonging to this property.
        month:       Optional filter — only include payments for this month
                     (e.g. "2026-03").

    Returns:
        RevenueResponse with total_revenue, payment_count, and applied filters.
    """
    sb = get_supabase_client()

    # Select payment fields + the tenant's property_id via the FK relation
    query = sb.table("payments").select(
        "id, amount_paid, month_covered, tenant_id, tenants(property_id)"
    )

    # Filter by month if provided
    if month:
        query = query.eq("month_covered", month)

    result = query.execute()
    payments = result.data

    # If filtering by property, narrow down in Python
    # (Supabase nested filters on joined columns can be tricky)
    if property_id:
        payments = [
            p for p in payments
            if p.get("tenants", {}).get("property_id") == property_id
        ]

    total = sum(float(p.get("amount_paid", 0)) for p in payments)
    count = len(payments)

    return RevenueResponse(
        total_revenue=round(total, 2),
        payment_count=count,
        property_id=property_id,
        month=month,
    )
