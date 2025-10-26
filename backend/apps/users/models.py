from __future__ import annotations

from typing import Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager["User"]):
    """Менеджер пользователей с базовыми сценариями создания учётных записей."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields: Any) -> "User":
        """Создаёт пользователя с проверкой email и сохранением пароля."""
        if not email:
            raise ValueError("Требуется предоставить email.")
        normalized_email = self.normalize_email(email)
        user = self.model(email=normalized_email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields: Any) -> "User":
        """Создаёт обычного пользователя."""
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None, **extra_fields: Any) -> "User":
        """Создаёт суперпользователя с повышенными правами."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Суперпользователь обязан иметь is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Суперпользователь обязан иметь is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Кастомная модель пользователя с email в качестве логина."""

    email = models.EmailField("Email", unique=True)
    name = models.CharField("Имя", max_length=255, null=True, blank=True)
    is_active = models.BooleanField("Активен", default=True)
    is_staff = models.BooleanField("Сотрудник", default=False)
    date_joined = models.DateTimeField("Дата регистрации", default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"
        indexes = [
            models.Index(fields=["email"], name="idx_user_email"),
        ]

    def __str__(self) -> str:
        """Возвращает понятное представление пользователя."""
        return self.email
