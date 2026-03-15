"""
FastAPI application entry point.
Registers CORS, routers, and the revenue endpoint.
"""

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import Optional

from app.config import get_cors_origins
from app.routes import auth, payments, properties, tenants, users
from app.services.auth import get_current_user
from app.services.tenant_documents import get_uploads_root
from app.services.revenue import calculate_total_revenue
from app.models import AuthUserOut, RevenueResponse

app = FastAPI(
    title="Rent Management API",
    description="Full-stack tenant rent management system",
    version="1.0.0",
)

# ── CORS (allow the React dev server) ──────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(get_uploads_root())), name="uploads")

# ── Routers ────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(properties.router)
app.include_router(tenants.router)
app.include_router(payments.router)


# ── Revenue endpoint ───────────────────────────────────────────────
@app.get("/api/revenue", response_model=RevenueResponse, tags=["Revenue"])
async def get_revenue(
    property_id: Optional[str] = Query(default=None),
    month: Optional[str] = Query(default=None),
    _: AuthUserOut = Depends(get_current_user),
):
    """
    Calculate total revenue collected.
    Optionally filter by property_id and/or month (e.g. '2026-03').
    """
    return calculate_total_revenue(property_id=property_id, month=month)


# ── Health check ───────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok"}
