import hashlib
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.app.core.database import get_session_factory
from backend.app.main import app
from backend.app.models.entities import User


@pytest.mark.asyncio
async def test_forgot_password_generic_response_non_enumeration():
    """Validates that non-existent email returns generic success to prevent enumeration."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/v1/auth/forgot-password", json={
            "email": "nonexistent_user_99999@leadflow.io"
        })
        assert res.status_code == 200
        data = res.json()
        assert "instructions have been sent" in data["message"].lower()
        assert data["has_security_question"] is False


@pytest.mark.asyncio
async def test_forgot_password_and_reset_token_flow():
    """End-to-end test of forgot password, token verification, and password reset."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register a test user
        unique_email = f"j5_test_{uuid.uuid4().hex[:8]}@example.com"
        initial_password = "InitialPassword123!"
        reg_res = await client.post("/v1/auth/register", json={
            "email": unique_email,
            "password": initial_password,
            "full_name": "J5 Recovery User",
            "org_name": f"J5 Org {uuid.uuid4().hex[:6]}",
        })
        assert reg_res.status_code == 201

        # 2. Trigger forgot password
        forgot_res = await client.post("/v1/auth/forgot-password", json={
            "email": unique_email
        })
        assert forgot_res.status_code == 200

        # 3. Inspect user in database to retrieve token hash for testing
        session_factory = get_session_factory()
        async with session_factory() as session:
            stmt = select(User).where(User.email == unique_email)
            user = (await session.execute(stmt)).scalars().first()
            assert user is not None
            assert user.reset_token_hash is not None
            assert user.reset_token_expires_at is not None

        # 4. Verify that an invalid token is rejected by verify-reset-token
        verify_invalid = await client.post("/v1/auth/verify-reset-token", json={
            "token": "completely_invalid_random_token_123"
        })
        assert verify_invalid.status_code == 200
        assert verify_invalid.json()["valid"] is False

        # 5. Set a known token hash in database to test valid reset
        test_plain_token = f"secret_reset_token_{uuid.uuid4().hex}"
        known_hash = hashlib.sha256(test_plain_token.encode("utf-8")).hexdigest()
        async with session_factory() as session:
            stmt = select(User).where(User.email == unique_email)
            user = (await session.execute(stmt)).scalars().first()
            user.reset_token_hash = known_hash
            session.add(user)
            await session.commit()

        # 6. Verify valid token
        verify_valid = await client.post("/v1/auth/verify-reset-token", json={
            "token": test_plain_token
        })
        assert verify_valid.status_code == 200
        assert verify_valid.json()["valid"] is True
        assert verify_valid.json()["email"] == unique_email

        # 7. Execute reset password
        new_password = "BrandNewPassword999!"
        reset_res = await client.post("/v1/auth/reset-password", json={
            "token": test_plain_token,
            "new_password": new_password,
        })
        assert reset_res.status_code == 200
        assert "successfully reset" in reset_res.json()["message"].lower()

        # 8. Single-use token must now be cleared (second attempt fails)
        second_attempt = await client.post("/v1/auth/reset-password", json={
            "token": test_plain_token,
            "new_password": "AnotherPassword123!",
        })
        assert second_attempt.status_code == 400

        # 9. Old password fails to login, new password succeeds
        old_login = await client.post("/v1/auth/login", json={
            "email": unique_email,
            "password": initial_password,
        })
        assert old_login.status_code == 401

        new_login = await client.post("/v1/auth/login", json={
            "email": unique_email,
            "password": new_password,
        })
        assert new_login.status_code == 200
        assert "access_token" in new_login.json()


@pytest.mark.asyncio
async def test_security_question_recovery_flow():
    """Validates security question configuration and answer recovery."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unique_email = f"sq_user_{uuid.uuid4().hex[:8]}@example.com"
        reg_res = await client.post("/v1/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "full_name": "Security Question User",
            "org_name": f"SQ Org {uuid.uuid4().hex[:6]}",
        })
        token = reg_res.json()["access_token"]

        # Configure security question
        setup_res = await client.post(
            "/v1/auth/security-question",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "security_question": "What is the name of your first pet?",
                "security_answer": "Fluffy",
            },
        )
        assert setup_res.status_code == 200

        # Request forgot password - challenge metadata returned
        forgot_res = await client.post("/v1/auth/forgot-password", json={
            "email": unique_email
        })
        assert forgot_res.status_code == 200
        assert forgot_res.json()["has_security_question"] is True
        assert forgot_res.json()["security_question"] == "What is the name of your first pet?"

        # Recover using incorrect answer
        bad_recover = await client.post("/v1/auth/security-question-recover", json={
            "email": unique_email,
            "security_answer": "WrongAnswer",
            "new_password": "NewSecurePass888!",
        })
        assert bad_recover.status_code == 400
        assert "incorrect" in bad_recover.json()["detail"].lower()

        # Recover using correct answer (case-insensitive)
        good_recover = await client.post("/v1/auth/security-question-recover", json={
            "email": unique_email,
            "security_answer": "fluffy",
            "new_password": "NewSecurePass888!",
        })
        assert good_recover.status_code == 200

        # Login with newly recovered password
        login_res = await client.post("/v1/auth/login", json={
            "email": unique_email,
            "password": "NewSecurePass888!",
        })
        assert login_res.status_code == 200
