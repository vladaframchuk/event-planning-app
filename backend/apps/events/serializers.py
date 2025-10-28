from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.events.models import Event

User = get_user_model()


class EventOwnerSerializer(serializers.ModelSerializer):
    """Сериализатор для вложенного владельца события."""

    class Meta:
        model = User
        fields = ("id", "email")
        read_only_fields = ("id", "email")


class EventSerializer(serializers.ModelSerializer):
    """Сериализатор для чтения событий."""

    owner = EventOwnerSerializer(read_only=True)

    class Meta:
        model = Event
        fields = (
            "id",
            "title",
            "category",
            "description",
            "start_at",
            "end_at",
            "location",
            "owner",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class EventCreateUpdateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания и обновления событий."""

    class Meta:
        model = Event
        fields = ("title", "category", "description", "start_at", "end_at", "location")

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """Проверяем, что дата окончания не раньше даты начала."""
        start_at = attrs.get("start_at") or getattr(self.instance, "start_at", None)
        end_at = attrs.get("end_at") or getattr(self.instance, "end_at", None)

        if start_at and end_at and end_at < start_at:
            raise serializers.ValidationError(
                {"end_at": "Дата окончания не может быть раньше даты начала."}
            )

        return attrs
