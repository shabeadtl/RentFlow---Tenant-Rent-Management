"""
Authentication and authorization helpers.
"""

from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from gotrue.errors import (
    AuthApiError,
    AuthInvalidCredentialsError,
    AuthInvalidJwtError,
    AuthSessionMissingError,
    AuthWeakPasswordError,
)

from app.config import (
    get_admin_auth_client,
    get_auth_client,
    get_db_client,
    get_settings,
)
from app.models import AuthSessionOut, AuthUserOut


ROLE_ADMIN = "admin"
ROLE_MANAGER = "manager"
ROLE_VIEWER = "viewer"


security = HTTPBearer(auto_error=False)


def _metadata_to_dict(metadata: Any) -> dict[str, Any]:
    if metadata is None:
        return {}
    if isinstance(metadata, dict):
        return metadata
    if hasattr(metadata, "model_dump"):
        return metadata.model_dump()
    return dict(metadata)


def _get_user_full_name(auth_user: Any) -> str | None:
    metadata = _metadata_to_dict(getattr(auth_user, "user_metadata", None))
    return metadata.get("full_name") or metadata.get("name")


def _serialize_auth_user(auth_user: Any, profile: dict) -> AuthUserOut:
    return AuthUserOut(
        id=str(auth_user.id),
        email=getattr(auth_user, "email", None),
        full_name=profile.get("full_name") or _get_user_full_name(auth_user),
        role=profile.get("role", ROLE_VIEWER),
        is_active=bool(profile.get("is_active", True)),
    )


def to_auth_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, AuthWeakPasswordError):
        return HTTPException(status_code=400, detail=exc.message)
    if isinstance(exc, AuthInvalidCredentialsError):
        return HTTPException(status_code=401, detail=exc.message)
    if isinstance(exc, AuthApiError):
        detail = exc.message or "Authentication failed."
        status_code = exc.status or 401
        return HTTPException(status_code=status_code, detail=detail)
    if isinstance(exc, (AuthInvalidJwtError, AuthSessionMissingError)):
        return HTTPException(status_code=401, detail="Invalid or expired session.")
    return HTTPException(status_code=500, detail="Authentication service is unavailable.")


def _get_app_user_profile(db, auth_user: Any) -> dict:
    user_id = str(auth_user.id)
    result = db.table("app_users").select("*").eq("id", user_id).execute()
    profile = result.data[0] if result.data else None

    if profile is None:
        raise HTTPException(
            status_code=403,
            detail="This account has not been provisioned by an admin yet.",
        )

    email = getattr(auth_user, "email", None)
    full_name = _get_user_full_name(auth_user)
    update_payload = {}
    if email and profile.get("email") != email:
        update_payload["email"] = email
    if full_name is not None and profile.get("full_name") != full_name:
        update_payload["full_name"] = full_name
    if update_payload:
        update_result = db.table("app_users").update(update_payload).eq("id", user_id).execute()
        if update_result.data:
            profile = update_result.data[0]

    return profile


def has_admin_user() -> bool:
    db = get_db_client()
    result = db.table("app_users").select("id").eq("role", ROLE_ADMIN).limit(1).execute()
    return bool(result.data)


def get_setup_state() -> dict[str, bool]:
    settings = get_settings()
    return {
        "needs_bootstrap": not has_admin_user(),
        "has_service_role": bool(settings.supabase_service_role_key),
    }


def login_user(email: str, password: str) -> AuthSessionOut:
    auth_client = get_auth_client()
    try:
        response = auth_client.sign_in_with_password({"email": email, "password": password})
    except Exception as exc:
        raise to_auth_http_exception(exc) from exc

    auth_user = response.user or response.session.user
    profile = _get_app_user_profile(get_db_client(), auth_user)
    if not profile.get("is_active", True):
        raise HTTPException(status_code=403, detail="This user account has been disabled.")

    return AuthSessionOut(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        expires_at=response.session.expires_at,
        expires_in=response.session.expires_in,
        token_type=response.session.token_type,
        user=_serialize_auth_user(auth_user, profile),
    )


def refresh_user_session(refresh_token: str) -> AuthSessionOut:
    auth_client = get_auth_client()
    try:
        response = auth_client.refresh_session(refresh_token)
    except Exception as exc:
        raise to_auth_http_exception(exc) from exc

    auth_user = response.user or response.session.user
    profile = _get_app_user_profile(get_db_client(), auth_user)
    if not profile.get("is_active", True):
        raise HTTPException(status_code=403, detail="This user account has been disabled.")

    return AuthSessionOut(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        expires_at=response.session.expires_at,
        expires_in=response.session.expires_in,
        token_type=response.session.token_type,
        user=_serialize_auth_user(auth_user, profile),
    )


def bootstrap_admin(email: str, password: str, full_name: str | None = None) -> AuthSessionOut:
    if has_admin_user():
        raise HTTPException(status_code=409, detail="Admin bootstrap has already been completed.")

    try:
        admin_client = get_admin_auth_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        response = admin_client.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name} if full_name else {},
            }
        )
    except Exception as exc:
        raise to_auth_http_exception(exc) from exc

    db = get_db_client()
    db.table("app_users").insert(
        {
            "id": str(response.user.id),
            "email": email,
            "full_name": full_name,
            "role": ROLE_ADMIN,
            "is_active": True,
        }
    ).execute()

    return login_user(email, password)


def _resolve_current_user(token: str) -> AuthUserOut:
    auth_client = get_auth_client()
    try:
        response = auth_client.get_user(token)
    except Exception as exc:
        raise to_auth_http_exception(exc) from exc

    auth_user = response.user
    if auth_user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    profile = _get_app_user_profile(get_db_client(), auth_user)
    if not profile.get("is_active", True):
        raise HTTPException(status_code=403, detail="This user account has been disabled.")

    return _serialize_auth_user(auth_user, profile)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AuthUserOut:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required.")
    return _resolve_current_user(credentials.credentials)


def require_admin(current_user: AuthUserOut = Depends(get_current_user)) -> AuthUserOut:
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


def require_manager(current_user: AuthUserOut = Depends(get_current_user)) -> AuthUserOut:
    if current_user.role != ROLE_MANAGER:
        raise HTTPException(status_code=403, detail="Manager access required.")
    return current_user


def require_manager_or_admin(
    current_user: AuthUserOut = Depends(get_current_user),
) -> AuthUserOut:
    if current_user.role not in {ROLE_MANAGER, ROLE_ADMIN}:
        raise HTTPException(status_code=403, detail="Manager or admin access required.")
    return current_user
