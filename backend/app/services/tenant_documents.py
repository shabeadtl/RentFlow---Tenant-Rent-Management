"""
Helpers for storing and removing tenant document uploads.
"""

import json
from pathlib import Path
import os
from uuid import uuid4

from fastapi import HTTPException, UploadFile


ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024
DOCUMENT_KINDS = ("agreement", "proof")


def get_uploads_root() -> Path:
    configured = os.getenv("UPLOADS_DIR", "").strip()
    root = Path(configured) if configured else Path(__file__).resolve().parents[2] / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _relative_upload_path(file_url: str) -> Path | None:
    cleaned = (file_url or "").strip()
    if not cleaned or cleaned.startswith("http://") or cleaned.startswith("https://"):
        return None

    relative = cleaned.lstrip("/")
    if relative.startswith("uploads/"):
        relative = relative[len("uploads/"):]
    if not relative:
        return None

    return Path(relative)


def _tenant_documents_dir(tenant_id: str) -> Path:
    tenant_dir = get_uploads_root() / "tenant-documents" / tenant_id
    tenant_dir.mkdir(parents=True, exist_ok=True)
    return tenant_dir


def _document_metadata_path(tenant_id: str, document_kind: str) -> Path:
    return _tenant_documents_dir(tenant_id) / f"{document_kind}.json"


def _load_document_metadata(tenant_id: str, document_kind: str) -> dict | None:
    metadata_path = _document_metadata_path(tenant_id, document_kind)
    if not metadata_path.exists():
        return None
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not payload.get("file_url"):
        return None
    return payload


def _write_document_metadata(tenant_id: str, document_kind: str, payload: dict) -> None:
    metadata_path = _document_metadata_path(tenant_id, document_kind)
    metadata_path.write_text(json.dumps(payload), encoding="utf-8")


def _delete_document_metadata(tenant_id: str, document_kind: str) -> None:
    metadata_path = _document_metadata_path(tenant_id, document_kind)
    if metadata_path.exists():
        metadata_path.unlink()


def _cleanup_empty_tenant_dir(tenant_id: str) -> None:
    tenant_dir = get_uploads_root() / "tenant-documents" / tenant_id
    if not tenant_dir.exists() or any(tenant_dir.iterdir()):
        return
    tenant_dir.rmdir()


def get_tenant_document_data(tenant_id: str, document_kind: str) -> dict | None:
    if document_kind not in DOCUMENT_KINDS:
        return None
    metadata = _load_document_metadata(tenant_id, document_kind)
    if metadata is None:
        return None
    relative_path = _relative_upload_path(metadata.get("file_url", ""))
    if relative_path is None:
        return None
    target = get_uploads_root() / relative_path
    if not target.exists():
        _delete_document_metadata(tenant_id, document_kind)
        return None
    return metadata


def attach_tenant_documents(tenant_row: dict) -> dict:
    enriched = dict(tenant_row)
    tenant_id = enriched.get("id")
    if not tenant_id:
        return enriched

    for document_kind in DOCUMENT_KINDS:
        metadata = get_tenant_document_data(str(tenant_id), document_kind)
        name_key = f"{document_kind}_file_name"
        url_key = f"{document_kind}_file_url"
        if metadata is None:
            enriched.setdefault(name_key, None)
            enriched.setdefault(url_key, None)
            continue
        if not enriched.get(name_key):
            enriched[name_key] = metadata.get("file_name")
        if not enriched.get(url_key):
            enriched[url_key] = metadata.get("file_url")
    return enriched


def delete_uploaded_file(file_url: str | None) -> None:
    relative_path = _relative_upload_path(file_url or "")
    if relative_path is None:
        return

    uploads_root = get_uploads_root().resolve()
    target = (uploads_root / relative_path).resolve()
    if uploads_root not in target.parents:
        return

    if target.exists() and target.is_file():
        target.unlink()

    current = target.parent
    while current != uploads_root and current.exists():
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


def delete_tenant_document(
    tenant_id: str,
    document_kind: str,
    file_url: str | None = None,
) -> None:
    metadata = get_tenant_document_data(tenant_id, document_kind)
    target_file_url = file_url or (metadata.get("file_url") if metadata else None)
    delete_uploaded_file(target_file_url)
    _delete_document_metadata(tenant_id, document_kind)
    tenant_dir = get_uploads_root() / "tenant-documents" / tenant_id
    if tenant_dir.exists():
        try:
            _cleanup_empty_tenant_dir(tenant_id)
        except OSError:
            pass


async def save_tenant_document(
    tenant_id: str,
    document_kind: str,
    upload_file: UploadFile,
    existing_file_url: str | None = None,
) -> dict[str, str]:
    original_name = Path(upload_file.filename or "").name.strip()
    if not original_name:
        raise HTTPException(status_code=400, detail="Document file name is required.")

    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported document type. Allowed types: {allowed}.",
        )

    content = await upload_file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded document is empty.")
    if len(content) > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Document must be 10 MB or smaller.")

    delete_tenant_document(tenant_id, document_kind, existing_file_url)
    tenant_dir = _tenant_documents_dir(tenant_id)

    stored_name = f"{document_kind}-{uuid4().hex}{extension}"
    target_path = tenant_dir / stored_name
    target_path.write_bytes(content)

    payload = {
        "file_name": original_name,
        "file_url": f"/uploads/tenant-documents/{tenant_id}/{stored_name}",
    }
    _write_document_metadata(tenant_id, document_kind, payload)
    return payload
