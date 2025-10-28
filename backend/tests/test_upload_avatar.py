from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


def _auth_client(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _build_image_file(name: str, *, size: tuple[int, int] = (64, 64), color: tuple[int, int, int] = (255, 0, 0)) -> SimpleUploadedFile:
    buffer = BytesIO()
    image = Image.new("RGB", size, color)
    format_hint = "JPEG" if name.lower().endswith((".jpg", ".jpeg")) else "PNG"
    image.save(buffer, format=format_hint)
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type=f"image/{format_hint.lower()}")


def test_upload_avatar_success(tmp_path: Path, settings) -> None:
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_URL = "/media/"

    user = User.objects.create_user(email="avatar@example.com", password="Password123")
    client = _auth_client(user)

    avatar = _build_image_file("avatar.jpg")
    response = client.post("/api/me/avatar", {"avatar": avatar}, format="multipart")

    assert response.status_code == 201
    payload = response.json()
    assert payload["avatar_url"].startswith("http://testserver/media/users/")

    expected_file = tmp_path / "users" / str(user.pk) / "avatar.jpg"
    assert expected_file.is_file()

    user.refresh_from_db()
    assert user.avatar.name == f"users/{user.pk}/avatar.jpg"
    assert user.avatar_url == payload["avatar_url"]


def test_upload_avatar_rejects_non_image(tmp_path: Path, settings) -> None:
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_URL = "/media/"

    user = User.objects.create_user(email="invalid@example.com", password="Password123")
    client = _auth_client(user)

    fake_file = SimpleUploadedFile("avatar.txt", b"not an image", content_type="text/plain")
    response = client.post("/api/me/avatar", {"avatar": fake_file}, format="multipart")

    assert response.status_code == 400
    body = response.json()
    assert "avatar" in body


def test_upload_avatar_without_file(tmp_path: Path, settings) -> None:
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_URL = "/media/"

    user = User.objects.create_user(email="missing@example.com", password="Password123")
    client = _auth_client(user)

    response = client.post("/api/me/avatar", {}, format="multipart")

    assert response.status_code == 400
    body = response.json()
    assert "avatar" in body
