"""
Pydantic models (schemas) for Properties, Tenants, and Payments.
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# ──────────────────────────── Properties ────────────────────────────

class PropertyBase(BaseModel):
    address: str
    total_units: int = Field(ge=1, default=1)
    rent_amount: float = Field(ge=0)
    note: Optional[str] = None


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    address: Optional[str] = None
    total_units: Optional[int] = Field(default=None, ge=1)
    rent_amount: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None


class PropertyOut(PropertyBase):
    id: str

    class Config:
        from_attributes = True


# ──────────────────────────── Tenants ───────────────────────────────

class TenantBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    property_id: str
    unit_number: Optional[str] = None
    lease_start: Optional[date] = None
    lease_end: Optional[date] = None
    status: str = Field(default="active", pattern="^(active|past)$")
    electric_meter_reading: Optional[str] = None
    final_meter_reading: Optional[str] = None
    vacating_date: Optional[date] = None
    outstanding_dues: Optional[float] = Field(default=None, ge=0)
    rent_due_day: Optional[int] = Field(default=1, ge=1, le=31)


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    property_id: Optional[str] = None
    unit_number: Optional[str] = None
    lease_start: Optional[date] = None
    lease_end: Optional[date] = None
    status: Optional[str] = Field(default=None, pattern="^(active|past)$")
    electric_meter_reading: Optional[str] = None
    final_meter_reading: Optional[str] = None
    vacating_date: Optional[date] = None
    outstanding_dues: Optional[float] = Field(default=None, ge=0)
    rent_due_day: Optional[int] = Field(default=None, ge=1, le=31)


class TenantOut(TenantBase):
    id: str
    agreement_file_name: Optional[str] = None
    agreement_file_url: Optional[str] = None
    proof_file_name: Optional[str] = None
    proof_file_url: Optional[str] = None

    class Config:
        from_attributes = True


# ──────────────────────────── Payments ──────────────────────────────

class PaymentBase(BaseModel):
    tenant_id: str
    amount_paid: float = Field(gt=0)
    payment_date: date = Field(default_factory=date.today)
    payment_type: str = Field(default="rent", pattern="^(rent|advance)$")
    note: Optional[str] = None
    month_covered: str = Field(
        ...,
        description="Month covered by this payment, e.g. '2026-03'",
        pattern=r"^\d{4}-(0[1-9]|1[0-2])$",
    )


class PaymentCreate(PaymentBase):
    pass


class PaymentUpdate(BaseModel):
    tenant_id: Optional[str] = None
    amount_paid: Optional[float] = Field(default=None, gt=0)
    payment_date: Optional[date] = None
    payment_type: Optional[str] = Field(default=None, pattern="^(rent|advance)$")
    note: Optional[str] = None
    month_covered: Optional[str] = Field(
        default=None,
        pattern=r"^\d{4}-(0[1-9]|1[0-2])$",
    )


class PaymentOut(PaymentBase):
    id: str

    class Config:
        from_attributes = True


# ──────────────────────────── Revenue ───────────────────────────────

class RevenueResponse(BaseModel):
    total_revenue: float
    payment_count: int
    property_id: Optional[str] = None
    month: Optional[str] = None


# ──────────────────────────── Auth & Users ─────────────────────────

ROLE_PATTERN = "^(admin|manager|viewer)$"


class AuthSetupResponse(BaseModel):
    needs_bootstrap: bool
    has_service_role: bool


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class BootstrapAdminRequest(LoginRequest):
    full_name: Optional[str] = None


class AuthUserOut(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str = Field(pattern=ROLE_PATTERN)
    is_active: bool = True


class AuthSessionOut(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: Optional[int] = None
    expires_in: Optional[int] = None
    token_type: str = "bearer"
    user: AuthUserOut


class AppUserCreate(BaseModel):
    email: str
    password: str = Field(min_length=6)
    full_name: Optional[str] = None
    role: str = Field(default="viewer", pattern=ROLE_PATTERN)
    is_active: bool = True


class AppUserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = Field(default=None, pattern=ROLE_PATTERN)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=6)


class AppUserOut(AuthUserOut):
    created_at: Optional[datetime] = None
    last_sign_in_at: Optional[datetime] = None
