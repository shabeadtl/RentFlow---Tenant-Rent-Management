"""
Application configuration and Supabase client factories.
"""

from dataclasses import dataclass
from functools import lru_cache
import os

from dotenv import load_dotenv
from gotrue import SyncGoTrueClient
from postgrest import SyncPostgrestClient


load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
)


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    cors_origins: tuple[str, ...]


class DatabaseClient:
    """Small wrapper around PostgREST to match the current table(...) usage."""

    def __init__(self, supabase_url: str, api_key: str, schema: str = "public"):
        headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
        }
        self._client = SyncPostgrestClient(
            f"{supabase_url}/rest/v1",
            headers=headers,
            schema=schema,
        )

    def table(self, table_name: str):
        return self._client.from_(table_name)

    def rpc(self, function_name: str, params: dict | None = None):
        return self._client.rpc(function_name, params or {})


def _parse_cors_origins(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return DEFAULT_CORS_ORIGINS
    origins = tuple(origin.strip() for origin in raw_value.split(",") if origin.strip())
    return origins or DEFAULT_CORS_ORIGINS


@lru_cache()
def get_settings() -> Settings:
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_anon_key = (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or ""
    ).strip()
    supabase_service_role_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_KEY")
        or ""
    ).strip()

    if not supabase_url or not supabase_anon_key:
        raise RuntimeError(
            "Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY "
            "(or SUPABASE_KEY for backward compatibility)."
        )

    return Settings(
        supabase_url=supabase_url,
        supabase_anon_key=supabase_anon_key,
        supabase_service_role_key=supabase_service_role_key,
        cors_origins=_parse_cors_origins(os.getenv("BACKEND_CORS_ORIGINS")),
    )


@lru_cache()
def get_db_client() -> DatabaseClient:
    settings = get_settings()
    api_key = settings.supabase_service_role_key or settings.supabase_anon_key
    return DatabaseClient(settings.supabase_url, api_key)


def get_supabase_client() -> DatabaseClient:
    """Backward-compatible alias for existing route/service imports."""
    return get_db_client()


def _build_auth_client(api_key: str) -> SyncGoTrueClient:
    settings = get_settings()
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }
    return SyncGoTrueClient(
        url=f"{settings.supabase_url}/auth/v1",
        headers=headers,
        auto_refresh_token=False,
        persist_session=False,
    )


def get_auth_client() -> SyncGoTrueClient:
    settings = get_settings()
    return _build_auth_client(settings.supabase_anon_key)


def get_admin_auth_client() -> SyncGoTrueClient:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise RuntimeError(
            "Missing SUPABASE_SERVICE_ROLE_KEY. Admin user management requires a service role key."
        )
    return _build_auth_client(settings.supabase_service_role_key)


def get_cors_origins() -> list[str]:
    return list(get_settings().cors_origins)
