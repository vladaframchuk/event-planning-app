from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.utils.translation import gettext as _
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class RegistrationSerializer(serializers.Serializer):
    """Регистрирует нового пользователя и валидирует входные данные."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=255)

    def validate_email(self, value: str) -> str:
        """Проверяет, что email ещё не занят."""
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError(_("Пользователь с таким email уже существует."), code="duplicate")
        return normalized

    def validate_password(self, value: str) -> str:
        """Убеждается, что пароль содержит буквы и цифры."""
        if not any(symbol.isdigit() for symbol in value):
            raise serializers.ValidationError(_("Пароль должен содержать хотя бы одну цифру."), code="weak_password")
        if not any(symbol.isalpha() for symbol in value):
            raise serializers.ValidationError(_("Пароль должен содержать хотя бы одну букву."), code="weak_password")
        return value

    def create(self, validated_data: dict[str, Any]) -> User:
        """Создаёт пользователя в неактивном состоянии."""
        password = validated_data.pop("password")
        name = validated_data.pop("name", None)
        return User.objects.create_user(
            password=password,
            is_active=False,
            name=name,
            **validated_data,
        )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Выдаёт JWT-токены по email и паролю, запрещая вход неактивным пользователям."""

    default_error_messages = {
        **TokenObtainPairSerializer.default_error_messages,
        "inactive": _("Аккаунт ещё не подтверждён. Проверьте почту."),
    }

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """Дополнительно проверяет статус пользователя перед выдачей токенов."""
        email = attrs.get(self.username_field)
        if email:
            try:
                user = User.objects.get(email__iexact=email)
            except User.DoesNotExist:
                pass
            else:
                if not user.is_active:
                    self.fail("inactive")

        return super().validate(attrs)


class ResendConfirmationSerializer(serializers.Serializer):
    """Валидирует email для повторной отправки письма подтверждения."""

    email = serializers.EmailField()

    default_error_messages = {
        "not_found": _("Пользователь с указанным email не найден."),
        "already_active": _("Email уже подтверждён."),
    }

    def validate_email(self, value: str) -> str:
        normalized = value.strip().lower()
        try:
            user = User.objects.get(email__iexact=normalized)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError(self.error_messages["not_found"], code="not_found") from exc

        if user.is_active:
            raise serializers.ValidationError(self.error_messages["already_active"], code="already_active")

        self.context["user"] = user
        return normalized

    @property
    def user(self) -> User:
        stored_user = self.context.get("user")
        if stored_user is None:
            raise AttributeError("Сначала вызовите is_valid(), чтобы получить пользователя.")
        return stored_user
