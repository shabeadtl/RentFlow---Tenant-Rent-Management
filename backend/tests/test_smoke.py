import asyncio
import io
import os
from tempfile import TemporaryDirectory
import uuid
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from starlette.datastructures import UploadFile

from app.main import app
from app.models import AuthUserOut
from app.services.auth import get_current_user
from app.services.tenant_documents import save_tenant_document


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table_name):
        self.db = db
        self.table_name = table_name
        self.filters = []
        self.operation = "select"
        self.payload = None
        self.order_field = None
        self.order_desc = False
        self.limit_count = None

    def select(self, _columns="*"):
        self.operation = "select"
        return self

    def eq(self, key, value):
        self.filters.append(lambda row, key=key, value=value: row.get(key) == value)
        return self

    def neq(self, key, value):
        self.filters.append(lambda row, key=key, value=value: row.get(key) != value)
        return self

    def order(self, key, desc=False):
        self.order_field = key
        self.order_desc = desc
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.table_name, [])

        if self.operation == "insert":
            row = dict(self.payload)
            row.setdefault("id", str(uuid.uuid4()))
            rows.append(row)
            return FakeResult([dict(row)])

        matching = [row for row in rows if all(check(row) for check in self.filters)]

        if self.operation == "update":
            updated = []
            for row in matching:
                row.update(self.payload)
                updated.append(dict(row))
            return FakeResult(updated)

        if self.operation == "delete":
            to_delete = {row["id"] for row in matching if "id" in row}
            self.db.tables[self.table_name] = [
                row for row in rows if row.get("id") not in to_delete
            ]
            return FakeResult([])

        data = [dict(row) for row in matching]
        if self.order_field:
            data.sort(key=lambda row: row.get(self.order_field), reverse=self.order_desc)
        if self.limit_count is not None:
            data = data[: self.limit_count]
        return FakeResult(data)


class FakeDB:
    def __init__(self, tables=None):
        self.tables = tables or {}

    def table(self, table_name):
        return FakeQuery(self, table_name)


class MissingRentDueDayDB(FakeDB):
    def __init__(self, tables=None):
        super().__init__(tables)
        self._should_raise_missing_column = True

    def table(self, table_name):
        query = super().table(table_name)
        original_execute = query.execute

        def execute_with_missing_column():
            if (
                table_name == "tenants"
                and query.operation == "insert"
                and self._should_raise_missing_column
                and isinstance(query.payload, dict)
                and "rent_due_day" in query.payload
            ):
                self._should_raise_missing_column = False
                raise APIError(
                    {
                        "code": "PGRST204",
                        "details": None,
                        "hint": None,
                        "message": "Could not find the 'rent_due_day' column of 'tenants' in the schema cache",
                    }
                )
            return original_execute()

        query.execute = execute_with_missing_column
        return query


class MissingPaymentTypeDB(FakeDB):
    def __init__(self, tables=None):
        super().__init__(tables)
        self._should_raise_missing_column = True

    def table(self, table_name):
        query = super().table(table_name)
        original_execute = query.execute

        def execute_with_missing_column():
            if (
                table_name == "payments"
                and query.operation == "insert"
                and self._should_raise_missing_column
                and isinstance(query.payload, dict)
                and "payment_type" in query.payload
            ):
                self._should_raise_missing_column = False
                raise APIError(
                    {
                        "code": "PGRST204",
                        "details": None,
                        "hint": None,
                        "message": "Could not find the 'payment_type' column of 'payments' in the schema cache",
                    }
                )
            return original_execute()

        query.execute = execute_with_missing_column
        return query


class FakeAuthUser:
    def __init__(self, user_id, email, full_name=""):
        self.id = user_id
        self.email = email
        self.user_metadata = {"full_name": full_name} if full_name else {}
        self.created_at = None
        self.last_sign_in_at = None


class FakeAuthSession:
    def __init__(self, user):
        self.user = user
        self.access_token = "access-token"
        self.refresh_token = "refresh-token"
        self.expires_at = 1234567890
        self.expires_in = 3600
        self.token_type = "bearer"


class FakeAuthResponse:
    def __init__(self, user):
        self.user = user
        self.session = FakeAuthSession(user)


class FakeAuthClient:
    def __init__(self, user):
        self.user = user

    def sign_in_with_password(self, _payload):
        return FakeAuthResponse(self.user)


class FakeAdminAuthClient:
    def __init__(self, users):
        self._users = users
        self.admin = self

    def list_users(self, page=1, per_page=1000):
        return list(self._users)


class RentManagementSmokeTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides.clear()

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_health_endpoint_returns_ok(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_viewer_cannot_create_property(self):
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="viewer-id",
            email="viewer@example.com",
            full_name="Viewer User",
            role="viewer",
            is_active=True,
        )

        response = self.client.post(
            "/api/properties/",
            json={
                "address": "Palm Residency",
                "total_units": 3,
                "rent_amount": 25000,
                "note": None,
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Manager or admin access required.")

    def test_manager_can_create_property(self):
        fake_db = FakeDB({"properties": []})
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="manager-id",
            email="manager@example.com",
            full_name="Manager User",
            role="manager",
            is_active=True,
        )

        with patch("app.routes.properties.get_supabase_client", return_value=fake_db):
            response = self.client.post(
                "/api/properties/",
                json={
                    "address": "Palm Residency",
                    "total_units": 3,
                    "rent_amount": 25000,
                    "note": "New property",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["address"], "Palm Residency")
        self.assertEqual(len(fake_db.tables["properties"]), 1)

    def test_manager_can_upload_tenant_document(self):
        fake_db = FakeDB(
            {
                "tenants": [
                    {
                        "id": "tenant-1",
                        "name": "Alex",
                        "property_id": "property-1",
                        "status": "active",
                    }
                ]
            }
        )
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="manager-id",
            email="manager@example.com",
            full_name="Manager User",
            role="manager",
            is_active=True,
        )

        async def fake_save_tenant_document(
            tenant_id,
            document_kind,
            upload_file,
            existing_file_url=None,
        ):
            return {
                "file_name": upload_file.filename,
                "file_url": f"/uploads/tenant-documents/{tenant_id}/{document_kind}-file.pdf",
            }

        with patch("app.routes.tenants.get_supabase_client", return_value=fake_db), patch(
            "app.routes.tenants.save_tenant_document",
            new=fake_save_tenant_document,
        ):
            response = self.client.post(
                "/api/tenants/tenant-1/documents",
                files={
                    "agreement": (
                        "agreement.pdf",
                        b"fake-pdf-content",
                        "application/pdf",
                    )
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["agreement_file_name"], "agreement.pdf")
        self.assertEqual(
            response.json()["agreement_file_url"],
            "/uploads/tenant-documents/tenant-1/agreement-file.pdf",
        )

    def test_save_tenant_document_recreates_directory_after_cleanup(self):
        with TemporaryDirectory() as temp_dir, patch.dict(os.environ, {"UPLOADS_DIR": temp_dir}, clear=False):
            existing_dir = os.path.join(temp_dir, "tenant-documents", "tenant-1")
            os.makedirs(existing_dir, exist_ok=True)
            existing_file = os.path.join(existing_dir, "agreement-old.pdf")
            with open(existing_file, "wb") as handle:
                handle.write(b"old-file")

            upload = UploadFile(filename="agreement.pdf", file=io.BytesIO(b"new-file"))
            result = asyncio.run(
                save_tenant_document(
                    "tenant-1",
                    "agreement",
                    upload,
                    existing_file_url="/uploads/tenant-documents/tenant-1/agreement-old.pdf",
                )
            )

            relative_path = result["file_url"].replace("/uploads/", "", 1).replace("/", os.sep)
            saved_file = os.path.join(temp_dir, relative_path)
            self.assertTrue(os.path.exists(saved_file))
            self.assertEqual(result["file_name"], "agreement.pdf")

    def test_tenant_create_falls_back_when_rent_due_day_column_is_missing(self):
        fake_db = MissingRentDueDayDB({"tenants": []})
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="manager-id",
            email="manager@example.com",
            full_name="Manager User",
            role="manager",
            is_active=True,
        )

        with patch("app.routes.tenants.get_supabase_client", return_value=fake_db), patch(
            "app.routes.tenants.ensure_property_capacity",
            return_value=None,
        ), patch(
            "app.routes.tenants.ensure_unit_available",
            return_value=None,
        ):
            response = self.client.post(
                "/api/tenants/",
                json={
                    "name": "Jordan",
                    "email": None,
                    "phone": None,
                    "property_id": "property-1",
                    "unit_number": None,
                    "lease_start": None,
                    "lease_end": None,
                    "status": "active",
                    "electric_meter_reading": None,
                    "final_meter_reading": None,
                    "vacating_date": None,
                    "outstanding_dues": None,
                    "rent_due_day": 1,
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["name"], "Jordan")
        self.assertNotIn("rent_due_day", fake_db.tables["tenants"][0])

    def test_duplicate_payment_is_rejected(self):
        fake_db = FakeDB(
            {
                "tenants": [
                    {
                        "id": "tenant-1",
                        "name": "Alex",
                        "property_id": "property-1",
                        "status": "active",
                    }
                ],
                "payments": [
                    {
                        "id": "payment-1",
                        "tenant_id": "tenant-1",
                        "amount_paid": 6000,
                        "payment_date": "2026-03-01",
                        "month_covered": "2026-03",
                        "note": None,
                    }
                ],
            }
        )
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="admin-id",
            email="admin@example.com",
            full_name="Admin User",
            role="admin",
            is_active=True,
        )

        with patch("app.routes.payments.get_supabase_client", return_value=fake_db):
            response = self.client.post(
                "/api/payments/",
                json={
                    "tenant_id": "tenant-1",
                    "amount_paid": 6000,
                    "payment_date": "2026-03-15",
                    "month_covered": "2026-03",
                    "note": None,
                },
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "A payment for this tenant and month already exists.",
        )

    def test_payment_create_falls_back_when_payment_type_column_is_missing(self):
        fake_db = MissingPaymentTypeDB(
            {
                "tenants": [
                    {
                        "id": "tenant-1",
                        "name": "Alex",
                        "property_id": "property-1",
                        "status": "active",
                    }
                ],
                "payments": [],
            }
        )
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="admin-id",
            email="admin@example.com",
            full_name="Admin User",
            role="admin",
            is_active=True,
        )

        with patch("app.routes.payments.get_supabase_client", return_value=fake_db):
            response = self.client.post(
                "/api/payments/",
                json={
                    "tenant_id": "tenant-1",
                    "amount_paid": 6000,
                    "payment_date": "2026-03-15",
                    "payment_type": "rent",
                    "month_covered": "2026-03",
                    "note": None,
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["payment_type"], "rent")
        self.assertNotIn("payment_type", fake_db.tables["payments"][0])

    def test_advance_payment_requires_migration_when_payment_type_column_is_missing(self):
        fake_db = MissingPaymentTypeDB(
            {
                "tenants": [
                    {
                        "id": "tenant-1",
                        "name": "Alex",
                        "property_id": "property-1",
                        "status": "active",
                    }
                ],
                "payments": [],
            }
        )
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="admin-id",
            email="admin@example.com",
            full_name="Admin User",
            role="admin",
            is_active=True,
        )

        with patch("app.routes.payments.get_supabase_client", return_value=fake_db):
            response = self.client.post(
                "/api/payments/",
                json={
                    "tenant_id": "tenant-1",
                    "amount_paid": 6000,
                    "payment_date": "2026-03-15",
                    "payment_type": "advance",
                    "month_covered": "2026-03",
                    "note": None,
                },
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Advance payments require the database migration before they can be saved.",
        )

    def test_users_route_requires_admin(self):
        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="manager-id",
            email="manager@example.com",
            full_name="Manager User",
            role="manager",
            is_active=True,
        )

        response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Admin access required.")

    def test_unprovisioned_user_cannot_sign_in(self):
        fake_db = FakeDB({"app_users": []})
        fake_auth_client = FakeAuthClient(
            FakeAuthUser(
                user_id="auth-user-1",
                email="user@example.com",
                full_name="Pending User",
            )
        )

        with patch("app.services.auth.get_auth_client", return_value=fake_auth_client), patch(
            "app.services.auth.get_db_client",
            return_value=fake_db,
        ):
            response = self.client.post(
                "/api/auth/login",
                json={
                    "email": "user@example.com",
                    "password": "secret123",
                },
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "This account has not been provisioned by an admin yet.",
        )

    def test_admin_user_list_serializes_auth_timestamps(self):
        fake_db = FakeDB(
            {
                "app_users": [
                    {
                        "id": "admin-user-1",
                        "email": "admin@example.com",
                        "full_name": "Admin User",
                        "role": "admin",
                        "is_active": True,
                    }
                ]
            }
        )
        fake_admin_client = FakeAdminAuthClient(
            [
                FakeAuthUser(
                    user_id="admin-user-1",
                    email="admin@example.com",
                    full_name="Admin User",
                )
            ]
        )
        fake_admin_client._users[0].created_at = datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc)
        fake_admin_client._users[0].last_sign_in_at = datetime(2026, 3, 15, 13, 0, tzinfo=timezone.utc)

        app.dependency_overrides[get_current_user] = lambda: AuthUserOut(
            id="admin-user-1",
            email="admin@example.com",
            full_name="Admin User",
            role="admin",
            is_active=True,
        )

        with patch("app.routes.users.get_admin_auth_client", return_value=fake_admin_client), patch(
            "app.routes.users.get_db_client",
            return_value=fake_db,
        ):
            response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["email"], "admin@example.com")
        self.assertIn("2026-03-15T12:00:00", response.json()[0]["created_at"])


if __name__ == "__main__":
    unittest.main()
