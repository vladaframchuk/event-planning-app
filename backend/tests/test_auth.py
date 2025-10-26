from __future__ import annotations

import json

import pytest
from django.core import mail
from django.http import HttpResponse
from django.test.utils import override_settings

from apps.auth.utils import EmailConfirmationTokenError, make_email_confirmation_token
from apps.users.models import User


def _post_json(client, path: str, payload: dict[str, object]) -> HttpResponse:
    """Вспомогательный хелпер для JSON-запросов в тестах."""
    return client.post(path, data=json.dumps(payload), content_type="application/json")


@pytest.mark.django_db
@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_register_sends_email_and_creates_inactive_user(client) -> None:
    response = _post_json(
        client,
        "/api/auth/register",
        {"email": "new_user@example.com", "password": "Password123", "name": "Новый пользователь"},
    )

    assert response.status_code == 201
    assert response.json() == {"message": "confirmation_sent"}

    user = User.objects.get(email="new_user@example.com")
    assert user.is_active is False
    assert user.name == "Новый пользователь"

    assert len(mail.outbox) == 1
    email_body = mail.outbox[0].body
    assert "api/auth/confirm?token=" in email_body


@pytest.mark.django_db
def test_confirm_activates_user_valid_token(client) -> None:
    user = User.objects.create_user(email="pending@example.com", password="Password123", is_active=False)
    token = make_email_confirmation_token(user.pk)

    response = client.get(f"/api/auth/confirm?token={token}")
    assert response.status_code == 200
    assert response.json() == {"message": "email_confirmed"}

    user.refresh_from_db()
    assert user.is_active is True


@pytest.mark.django_db
def test_confirm_rejects_expired_or_bad_token(client, monkeypatch) -> None:
    bad_response = client.get("/api/auth/confirm?token=явно-невалидный")
    assert bad_response.status_code == 400
    assert "Некорректный токен" in bad_response.json()["token"][0]

    def fake_verify(token: str, max_age_seconds: int = 172_800) -> int:  # noqa: ARG001
        raise EmailConfirmationTokenError("Срок действия токена истёк.")

    monkeypatch.setattr("apps.auth.views.verify_email_confirmation_token", fake_verify)
    expired_response = client.get("/api/auth/confirm?token=fake")
    assert expired_response.status_code == 400
    assert "Срок действия токена истёк." in expired_response.json()["token"][0]


@pytest.mark.django_db
def test_login_fails_if_inactive(client) -> None:
    User.objects.create_user(email="inactive@example.com", password="Password123", is_active=False)

    response = _post_json(
        client,
        "/api/auth/login",
        {"email": "inactive@example.com", "password": "Password123"},
    )

    assert response.status_code == 400
    body = response.json()
    if isinstance(body.get("detail"), str):
        message = body["detail"]
    else:
        errors = body.get("detail") or body.get("non_field_errors") or []
        if isinstance(errors, list):
            message = " ".join(str(part) for part in errors)
        else:
            message = str(errors)
    assert "Аккаунт не подтверждён" in message


@pytest.mark.django_db
def test_login_success_and_refresh_returns_new_access(client) -> None:
    User.objects.create_user(email="active@example.com", password="Password123", is_active=True)

    login_response = _post_json(
        client,
        "/api/auth/login",
        {"email": "active@example.com", "password": "Password123"},
    )

    assert login_response.status_code == 200
    tokens = login_response.json()
    assert "access" in tokens and "refresh" in tokens

    refresh_response = _post_json(client, "/api/auth/refresh", {"refresh": tokens["refresh"]})
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    assert "access" in new_tokens
    assert new_tokens["access"] != tokens["access"]
