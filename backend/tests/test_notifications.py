import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.core.database import get_session_factory
from backend.app.main import app
from backend.app.services.notifications import create_and_send_notification


@pytest.mark.asyncio
async def test_notifications_crud_and_user_isolation():
    """Validates in-app notifications listing, unread counts, marking read/all-read, and tenant/user boundary isolation."""
    session_factory = get_session_factory()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        suffix = uuid.uuid4().hex[:6]

        # 1. Register User A
        user_a_email = f"usera_{suffix}@example.com"
        reg_a = await client.post(
            "/v1/auth/register",
            json={
                "email": user_a_email,
                "password": "Password123!",
                "full_name": "User Alpha",
                "org_name": f"Org Alpha {suffix}",
            },
        )
        user_a_id = reg_a.json()["user_id"]
        user_a_org_id = reg_a.json()["org_id"]
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # 2. Register User B
        user_b_email = f"userb_{suffix}@example.com"
        reg_b = await client.post(
            "/v1/auth/register",
            json={
                "email": user_b_email,
                "password": "Password123!",
                "full_name": "User Beta",
                "org_name": f"Org Beta {suffix}",
            },
        )
        user_b_id = reg_b.json()["user_id"]
        user_b_org_id = reg_b.json()["org_id"]
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 3. Create three notifications for User A directly via notification service
        async with session_factory() as session:
            notif1 = await create_and_send_notification(
                session=session,
                recipient_id=user_a_id,
                org_id=user_a_org_id,
                title="System Alert 1",
                message="First notification for User A",
                type="system",
                send_email=False,
            )
            notif2 = await create_and_send_notification(
                session=session,
                recipient_id=user_a_id,
                org_id=user_a_org_id,
                title="System Alert 2",
                message="Second notification for User A",
                type="system",
                send_email=False,
            )
            notif3 = await create_and_send_notification(
                session=session,
                recipient_id=user_a_id,
                org_id=user_a_org_id,
                title="System Alert 3",
                message="Third notification for User A",
                type="system",
                send_email=False,
            )
            # Create one notification for User B
            notif_b = await create_and_send_notification(
                session=session,
                recipient_id=user_b_id,
                org_id=user_b_org_id,
                title="Alert for Beta",
                message="Only User B should see this",
                type="system",
                send_email=False,
            )
            await session.commit()

        # 4. User A fetches notifications: should see 3 items, all unread
        res_a = await client.get("/v1/notifications", headers=headers_a)
        assert res_a.status_code == 200
        data_a = res_a.json()
        assert data_a["unread_count"] == 3
        assert len(data_a["items"]) == 3
        # Ensure User B's notification is NOT visible to User A
        assert not any(n["id"] == str(notif_b.id) for n in data_a["items"])

        # 5. User A marks notif1 as read
        patch_res = await client.patch(f"/v1/notifications/{notif1.id}/read", headers=headers_a)
        assert patch_res.status_code == 200
        assert patch_res.json()["is_read"] is True

        # Check unread count is now 2
        res_a2 = await client.get("/v1/notifications", headers=headers_a)
        assert res_a2.json()["unread_count"] == 2

        # 6. User B cannot mark User A's notification as read (404 / isolated)
        forbidden_patch = await client.patch(f"/v1/notifications/{notif2.id}/read", headers=headers_b)
        assert forbidden_patch.status_code == 404

        # 7. User A marks all as read
        read_all_res = await client.post("/v1/notifications/read-all", headers=headers_a)
        assert read_all_res.status_code == 200
        assert read_all_res.json()["updated_count"] == 2

        # Verify unread count is 0
        res_a3 = await client.get("/v1/notifications", headers=headers_a)
        assert res_a3.json()["unread_count"] == 0

        # Verify User B still has 1 unread notification
        res_b = await client.get("/v1/notifications", headers=headers_b)
        assert res_b.json()["unread_count"] == 1
        assert len(res_b.json()["items"]) == 1
        assert res_b.json()["items"][0]["id"] == str(notif_b.id)
