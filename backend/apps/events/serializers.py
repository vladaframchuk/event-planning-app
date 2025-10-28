from __future__ import annotations

from datetime import datetime

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from apps.events.models import Event, Participant

User = get_user_model()


def _ensure_aware(value: datetime | None) -> datetime | None:
    """�?���?��?�?�?���?�?�<�� ����'�?��?�? �? ������?�?�?�?��?�? Europe/Berlin."""
    if value is None:
        return None

    current_tz = timezone.get_current_timezone()
    if timezone.is_naive(value):
        return timezone.make_aware(value, current_tz)
    return timezone.localtime(value, current_tz)


class OwnerSerializer(serializers.ModelSerializer):
    """�?�?�?�?�?���?�?�<�� ���������� владельца для событий."""

    class Meta:
        model = User
        fields = ["id", "email"]
        read_only_fields = ["id", "email"]


class EventSerializer(serializers.ModelSerializer):
    """Сериализатор события для чтения со сведениями о роли текущего пользователя."""

    owner = OwnerSerializer(read_only=True)
    role_for_current_user = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id",
            "owner",
            "title",
            "category",
            "description",
            "start_at",
            "end_at",
            "location",
            "created_at",
            "updated_at",
            "role_for_current_user",
        ]
        read_only_fields = fields

    def get_role_for_current_user(self, obj: Event) -> str:
        """Возвращает роль текущего пользователя в событии."""
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or user.is_anonymous:
            return Participant.Role.MEMBER

        if obj.owner_id == user.id:
            return Participant.Role.ORGANIZER

        participation = getattr(obj, "current_user_participation", None)
        if participation is not None:
            participant = participation[0] if participation else None
        else:
            participant = obj.participants.filter(user=user).first()

        if participant is not None:
            return participant.role

        return Participant.Role.MEMBER


class EventCreateUpdateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания и обновления событий без возможности менять владельца."""

    class Meta:
        model = Event
        fields = ["title", "category", "description", "start_at", "end_at", "location"]

    def validate(self, attrs: dict[str, object | None]) -> dict[str, object | None]:
        """Проверяет корректность дат и приводит их к timezone-aware."""
        start_raw = attrs.get("start_at")
        end_raw = attrs.get("end_at")

        start_at = _ensure_aware(start_raw) if isinstance(start_raw, datetime) else None
        end_at = _ensure_aware(end_raw) if isinstance(end_raw, datetime) else None

        if start_at is not None:
            attrs["start_at"] = start_at
        if end_at is not None:
            attrs["end_at"] = end_at

        current_start = start_at or (
            _ensure_aware(self.instance.start_at) if getattr(self, "instance", None) else None
        )
        current_end = end_at or (
            _ensure_aware(self.instance.end_at) if getattr(self, "instance", None) else None
        )

        if current_start and current_end and current_end < current_start:
            raise serializers.ValidationError(
                {"end_at": "Дата окончания не может быть раньше даты начала события."}
            )

        return attrs
