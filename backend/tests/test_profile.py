from __future__ import annotations

import re

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.test.utils import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_get_and_update_me() -> None:
    user = User.objects.create_user(
        email="me@example.com",
        password="Password123",
        name="Alice",
        locale="ru-RU",
        timezone="Europe/Moscow",
        avatar_url="https://cdn.example.com/avatars/alice.png",
        email_notifications_enabled=False,
    )
    client = _auth_client(user)

    response = client.get("/api/me")
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "me@example.com"
    assert payload["name"] == "Alice"
    assert payload["locale"] == "ru-RU"
    assert payload["timezone"] == "Europe/Moscow"
    assert payload["avatar_url"] == "https://cdn.example.com/avatars/alice.png"
    assert payload["email_notifications_enabled"] is False

    new_data = {
        "name": "Alice Updated",
        "avatar_url": "https://cdn.example.com/avatars/alice-new.png",
        "locale": "en-US",
        "timezone": "UTC",
    }
    response = client.patch("/api/me", new_data, format="json")
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Alice Updated"
    assert updated["avatar_url"] == "https://cdn.example.com/avatars/alice-new.png"
    assert updated["locale"] == "en-US"
    assert updated["timezone"] == "UTC"

    user.refresh_from_db()
    assert user.name == "Alice Updated"
    assert user.avatar_url == "https://cdn.example.com/avatars/alice-new.png"
    assert user.locale == "en-US"
    assert user.timezone == "UTC"


def test_change_password_success_and_fail() -> None:
    user = User.objects.create_user(email="pass@example.com", password="Password123")
    client = _auth_client(user)

    success_payload = {"old_password": "Password123", "new_password": "Newpass456"}
    response = client.post("/api/me/change-password", success_payload, format="json")
    assert response.status_code == 204

    user.refresh_from_db()
    assert user.check_password("Newpass456")

    wrong_old_payload = {"old_password": "Wrong123", "new_password": "Another789"}
    response = client.post("/api/me/change-password", wrong_old_payload, format="json")
    assert response.status_code == 400
    assert "old_password" in response.json()

    same_password_payload = {"old_password": "Newpass456", "new_password": "Newpass456"}
    response = client.post("/api/me/change-password", same_password_payload, format="json")
    assert response.status_code == 400
    assert "new_password" in response.json()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_change_email_flow() -> None:
    user = User.objects.create_user(email="old@example.com", password="Password123")
    User.objects.create_user(email="used@example.com", password="Password123")

    client = _auth_client(user)

    response = client.post(
        "/api/account/email/change-init",
        {"new_email": "used@example.com"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["new_email"][0].startswith("This email")

    response = client.post(
        "/api/account/email/change-init",
        {"new_email": "new@example.com"},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["detail"].startswith("Письмо с подтверждением")
    assert len(mail.outbox) == 1
    email = mail.outbox[0]
    assert email.to == ["new@example.com"]

    match = re.search(r"token=([^\s]+)", email.body)
    assert match, "Email body should contain confirmation token."
    token = match.group(1)

    unauthenticated_client = APIClient()
    confirm_response = unauthenticated_client.get(f"/api/account/email/change-confirm?token={token}")
    assert confirm_response.status_code == 200
    assert confirm_response.json()["detail"].startswith("Email успешно обновлён")

    user.refresh_from_db()
    assert user.email == "new@example.com"

    reused_token_response = unauthenticated_client.get(f"/api/account/email/change-confirm?token={token}")
    assert reused_token_response.status_code == 400
    assert reused_token_response.json()["detail"] == "Адрес уже подтверждён ранее."


def test_notification_settings_toggle() -> None:
    user = User.objects.create_user(email="notify@example.com", password="Password123", email_notifications_enabled=True)
    client = _auth_client(user)

    response = client.patch(
        "/api/account/notifications",
        {"email_notifications_enabled": False},
        format="json",
    )
    assert response.status_code == 200
    assert response.json() == {"email_notifications_enabled": False}

    user.refresh_from_db()
    assert user.email_notifications_enabled is False
