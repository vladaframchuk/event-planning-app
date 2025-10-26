from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class RegistrationSerializer(serializers.Serializer):
    """Сериализатор регистрации нового пользователя с базовой валидацией пароля и email."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=255)

    def validate_email(self, value: str) -> str:
        """Убеждаемся, что email ещё не занят."""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Пользователь с таким email уже зарегистрирован.")
        return value

    def validate_password(self, value: str) -> str:
        """Проверяем обязательное наличие цифры и буквы в пароле."""
        if not any(symbol.isdigit() for symbol in value):
            raise serializers.ValidationError("Пароль должен содержать хотя бы одну цифру.")
        if not any(symbol.isalpha() for symbol in value):
            raise serializers.ValidationError("Пароль должен содержать хотя бы одну букву.")
        return value

    def create(self, validated_data: dict[str, Any]) -> User:
        """Создаём неактивного пользователя и сохраняем имя, если оно передано."""
        password = validated_data.pop("password")
        name = validated_data.pop("name", None)
        return User.objects.create_user(
            password=password,
            is_active=False,
            name=name,
            **validated_data,
        )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Формирует пару JWT по email и паролю, блокируя неактивные аккаунты."""

    default_error_messages = {
        **TokenObtainPairSerializer.default_error_messages,
        "inactive": "Аккаунт не подтверждён. Проверьте почту и активируйте профиль.",
    }

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """Проверяем активность аккаунта до выдачи токенов."""
        email = attrs.get(self.username_field)
        if email:
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                pass
            else:
                if not user.is_active:
                    self.fail("inactive")

        return super().validate(attrs)

