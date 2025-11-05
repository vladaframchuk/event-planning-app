from __future__ import annotations


from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from apps.chat.models import Message


class MessageSerializer(serializers.ModelSerializer):
    """Сериализатор для чтения сообщений чата."""

    author_name = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    is_me = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = (
            "id",
            "event",
            "author",
            "author_name",
            "author_avatar",
            "is_me",
            "text",
            "created_at",
            "edited_at",
        )
        read_only_fields = (
            "id",
            "event",
            "author",
            "author_name",
            "author_avatar",
            "is_me",
            "created_at",
            "edited_at",
        )

    def get_author_name(self, obj: Message) -> str:
        user = obj.author
        if getattr(user, "name", None):
            return str(user.name)
        return str(getattr(user, "email", ""))

    def get_author_avatar(self, obj: Message) -> str | None:
        user = obj.author
        avatar_url = getattr(user, "avatar_url", None)
        if avatar_url:
            return avatar_url

        avatar_field = getattr(user, "avatar", None)
        if not avatar_field:
            return None

        try:
            relative_url = avatar_field.url
        except (ValueError, ObjectDoesNotExist):  # noqa: PERF203
            return None

        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(relative_url)
        return relative_url

    def get_is_me(self, obj: Message) -> bool:
        request = self.context.get("request")
        if request is None or not hasattr(request, "user"):
            return False
        return request.user.id == obj.author_id


class MessageCreateSerializer(serializers.Serializer):
    """Валидация входящих данных для создания сообщения."""

    text = serializers.CharField(
        max_length=4000, allow_blank=False, trim_whitespace=True
    )

    def validate_text(self, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise serializers.ValidationError("Текст сообщения не может быть пустым.")
        return trimmed
