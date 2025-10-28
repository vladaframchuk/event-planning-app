from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class MeSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "name", "avatar_url", "locale", "timezone", "date_joined")
        read_only_fields = ("id", "email", "date_joined")

    def get_avatar_url(self, obj: User) -> str | None:
        request = self.context.get("request")
        if obj.avatar_url:
            return obj.avatar_url
        if not obj.avatar:
            return None
        avatar_url = obj.avatar.url
        if request is not None:
            return request.build_absolute_uri(avatar_url)
        return avatar_url


class MeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("name", "avatar_url", "locale", "timezone")
        extra_kwargs = {
            "name": {"required": False, "allow_null": True, "allow_blank": True},
            "avatar_url": {"required": False, "allow_null": True, "allow_blank": True},
            "locale": {"required": False, "allow_null": True, "allow_blank": True},
            "timezone": {"required": False, "allow_null": True, "allow_blank": True},
        }

    def update(self, instance: User, validated_data: dict[str, Any]) -> User:
        changed_fields: set[str] = set()

        if "avatar_url" in validated_data:
            instance.avatar_url = validated_data["avatar_url"]
            changed_fields.add("avatar_url")
            if instance.avatar_url:
                instance.avatar = None
                changed_fields.add("avatar")

        for field in ("name", "locale", "timezone"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
                changed_fields.add(field)

        if changed_fields:
            instance.save(update_fields=list(changed_fields))
        return instance


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    MIN_LENGTH = 8

    def validate_old_password(self, value: str) -> str:
        user = self.context.get("request").user  # type: ignore[assignment]
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.", code="invalid")
        return value

    def validate_new_password(self, value: str) -> str:
        if len(value) < self.MIN_LENGTH:
            raise serializers.ValidationError(
                f"New password must be at least {self.MIN_LENGTH} characters long.",
                code="min_length",
            )

        has_letter = any(char.isalpha() for char in value)
        has_digit = any(char.isdigit() for char in value)

        if not (has_letter and has_digit):
            raise serializers.ValidationError(
                "New password must contain at least one letter and one digit.",
                code="weak_password",
            )

        return value

    def validate(self, attrs: dict[str, str]) -> dict[str, str]:
        if attrs["old_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": "New password must be different from the current password."},
                code="password_same",
            )
        return attrs

    def save(self, **kwargs) -> User:
        user: User = self.context["request"].user  # type: ignore[assignment]
        new_password = self.validated_data["new_password"]
        user.set_password(new_password)
        user.save(update_fields=["password"])
        return user


class EmailChangeRequestSerializer(serializers.Serializer):
    new_email = serializers.EmailField()

    def validate_new_email(self, value: str) -> str:
        user: User = self.context["request"].user  # type: ignore[assignment]
        normalized = value.strip().lower()
        if normalized == user.email.lower():
            raise serializers.ValidationError(
                "New email must be different from the current email.",
                code="same_email",
            )
        if User.objects.filter(email__iexact=normalized).exclude(pk=user.pk).exists():
            raise serializers.ValidationError(
                "This email is already in use.",
                code="email_in_use",
            )
        return normalized
