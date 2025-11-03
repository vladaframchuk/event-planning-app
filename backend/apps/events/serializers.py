from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from apps.events.models import Event, Invite, Participant

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
    viewer_role = serializers.SerializerMethodField()

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
            "viewer_role",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


    def get_viewer_role(self, obj: Event) -> str | None:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return None
        participant_role = (
            Participant.objects.filter(event=obj, user=user)
            .values_list("role", flat=True)
            .first()
        )
        if participant_role:
            return participant_role
        if obj.owner_id == getattr(user, "id", None):
            return Participant.Role.ORGANIZER
        return None


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


class InviteCreateSerializer(serializers.Serializer):
    """Сериализатор создания инвайта."""

    expires_in_hours = serializers.IntegerField(min_value=1, max_value=168)
    max_uses = serializers.IntegerField(min_value=0, max_value=1000, required=False, default=0)

    def create(self, validated_data: dict[str, Any]) -> Invite:
        """Создает инвайт с ограничениями по времени и количеству использований."""
        event: Event = self.context["event"]
        user = self.context["user"]
        expires_in_hours: int = validated_data["expires_in_hours"]
        max_uses: int = validated_data.get("max_uses", 0)

        expires_at = timezone.now() + timedelta(hours=expires_in_hours)
        invite = Invite.objects.create(
            event=event,
            created_by=user,
            expires_at=expires_at,
            max_uses=max_uses,
        )
        return invite


class InviteReadSerializer(serializers.ModelSerializer):
    """Сериализатор чтения инвайта с готовой ссылкой."""

    invite_url = serializers.SerializerMethodField()

    class Meta:
        model = Invite
        fields = ("token", "invite_url", "expires_at", "max_uses", "uses_count", "is_revoked")
        read_only_fields = fields

    def get_invite_url(self, obj: Invite) -> str:
        """Формирует ссылку для присоединения."""
        base_url = getattr(settings, "SITE_FRONT_URL", "http://localhost:3000").rstrip("/")
        return f"{base_url}/join?token={obj.token}"


class ParticipantUserSerializer(serializers.ModelSerializer):
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "name", "avatar")

    def get_avatar(self, obj: User) -> str | None:
        request = self.context.get("request")
        if obj.avatar_url:
            return obj.avatar_url
        avatar_field = getattr(obj, "avatar", None)
        if avatar_field and getattr(avatar_field, "name", ""):
            try:
                url = avatar_field.url
            except Exception:  # noqa: BLE001
                return None
            if request is not None:
                return request.build_absolute_uri(url)
            return url
        return None


class ParticipantSerializer(serializers.ModelSerializer):
    user = ParticipantUserSerializer(read_only=True)

    class Meta:
        model = Participant
        fields = ("id", "user", "role", "joined_at")
        read_only_fields = ("id", "user", "role", "joined_at")


class ParticipantRoleUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Participant
        fields = ("role",)






