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
        avatar_url="https://cdn.example.com/avatars/alice.png",
        email_notifications_enabled=False,
    )
    client = _auth_client(user)

    response = client.get("/api/me")
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "me@example.com"
    assert payload["name"] == "Alice"
    assert payload["avatar_url"] == "https://cdn.example.com/avatars/alice.png"
    assert payload["email_notifications_enabled"] is False
    assert "locale" not in payload
    assert "timezone" not in payload

    new_data = {
        "name": "Alice Updated",
        "avatar_url": "https://cdn.example.com/avatars/alice-new.png",
    }
    response = client.patch("/api/me", new_data, format="json")
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Alice Updated"
    assert updated["avatar_url"] == "https://cdn.example.com/avatars/alice-new.png"
    assert "locale" not in updated
    assert "timezone" not in updated

    user.refresh_from_db()
    assert user.name == "Alice Updated"
    assert user.avatar_url == "https://cdn.example.com/avatars/alice-new.png"
    assert not hasattr(user, "locale")
    assert not hasattr(user, "timezone")


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
    wrong_payload = response.json()
    assert wrong_payload["detail"] == "Некорректные данные."
    assert wrong_payload["errors"]["old_password"] == ["Текущий пароль указан неверно."]

    same_password_payload = {"old_password": "Newpass456", "new_password": "Newpass456"}
    response = client.post("/api/me/change-password", same_password_payload, format="json")
    assert response.status_code == 400
    same_payload = response.json()
    assert same_payload["detail"] == "Некорректные данные."
    assert same_payload["errors"]["new_password"] == ["Новый пароль должен отличаться от текущего."]


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
    conflict_payload = response.json()
    assert conflict_payload["detail"] == "Некорректные данные."
    assert conflict_payload["errors"]["new_email"] == ["Этот email уже используется."]

    response = client.post(
        "/api/account/email/change-init",
        {"new_email": "new@example.com"},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["detail"] == "Письмо с подтверждением отправлено на новый адрес."
    assert len(mail.outbox) == 1
    email = mail.outbox[0]
    assert email.to == ["new@example.com"]

    match = re.search(r"token=([^\s]+)", email.body)
    assert match, "Email body should contain confirmation token."
    token = match.group(1)

    unauthenticated_client = APIClient()
    confirm_response = unauthenticated_client.get(f"/api/account/email/change-confirm?token={token}")
    assert confirm_response.status_code == 200
    assert confirm_response.json()["detail"] == "Email успешно обновлён. Пожалуйста, войдите заново."

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
