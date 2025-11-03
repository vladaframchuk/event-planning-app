from __future__ import annotations

import os
from typing import Any
from uuid import uuid4

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone as django_timezone
from django.utils.translation import gettext_lazy as _


def user_avatar_upload_to(instance: "User", filename: str) -> str:
    """Build a deterministic storage path for user avatar files."""
    _, ext = os.path.splitext(filename)
    ext = ext.lower() or ".bin"
    user_id = instance.pk or "new"
    return f"users/{user_id}/avatars/{uuid4().hex}{ext}"


class UserManager(BaseUserManager["User"]):
    """Custom manager that uses email as the unique identifier."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields: Any) -> "User":
        if not email:
            raise ValueError("The email field must be set.")
        normalized_email = self.normalize_email(email)
        user = self.model(email=normalized_email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields: Any) -> "User":
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None, **extra_fields: Any) -> "User":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField("Email", unique=True)
    name = models.CharField("Name", max_length=255, null=True, blank=True)
    email_notifications_enabled = models.BooleanField(
        _('Уведомления на email включены'),
        default=True,
        help_text=_('Получайте напоминания и обновления о событиях на электронную почту.'),
    )
    avatar = models.ImageField(
        "Avatar",
        upload_to=user_avatar_upload_to,
        null=True,
        blank=True,
    )
    avatar_url = models.URLField(
        "Avatar URL",
        max_length=500,
        null=True,
        blank=True,
    )
    is_active = models.BooleanField("Active", default=True)
    is_staff = models.BooleanField("Staff", default=False)
    date_joined = models.DateTimeField("Date joined", default=django_timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        indexes = [
            models.Index(fields=["email"], name="idx_user_email"),
        ]

    def __str__(self) -> str:
        return self.email
