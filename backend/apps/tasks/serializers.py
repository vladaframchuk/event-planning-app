from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.events.models import Event, Participant
from apps.tasks.models import Task, TaskList


class TaskListSerializer(serializers.ModelSerializer):
    """Сериализация колонок канбана."""

    class Meta:
        model = TaskList
        fields = ("id", "event", "title", "order", "created_at", "updated_at")
        read_only_fields = ("id", "order", "created_at", "updated_at")


class TaskSerializer(serializers.ModelSerializer):
    """Сериализация задач с проверкой зависимостей и дедлайнов."""

    status = serializers.ChoiceField(choices=Task.Status.choices, default=Task.Status.TODO)
    assignee = serializers.PrimaryKeyRelatedField(queryset=Participant.objects.all(), required=False, allow_null=True)
    depends_on = serializers.PrimaryKeyRelatedField(
        queryset=Task.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = Task
        fields = (
            "id",
            "list",
            "title",
            "description",
            "status",
            "assignee",
            "start_at",
            "due_at",
            "order",
            "depends_on",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "order", "created_at", "updated_at")

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = self.instance
        task_list = attrs.get("list") or getattr(instance, "list", None)

        start_at = attrs.get("start_at")
        due_at = attrs.get("due_at")
        if instance:
            start_at = attrs.get("start_at", instance.start_at)
            due_at = attrs.get("due_at", instance.due_at)

        if start_at and due_at and due_at < start_at:
            message = _("Дата дедлайна не может быть раньше даты начала.")
            raise serializers.ValidationError({"due_at": message})

        if task_list is None:
            raise serializers.ValidationError({"list": _("Список задач обязателен.")})

        event_id = task_list.event_id

        depends = attrs.get("depends_on")
        if depends is not None:
            invalid_ids = [task.id for task in depends if task.list.event_id != event_id]
            if invalid_ids:
                message = _("Все зависимости должны принадлежать тому же событию.")
                raise serializers.ValidationError({"depends_on": message})

        assignee = attrs.get("assignee")
        if assignee is not None:
            if assignee.event_id != event_id:
                message = _("Ответственный должен принадлежать тому же событию.")
                raise serializers.ValidationError({"assignee": message})

        return super().validate(attrs)

    def create(self, validated_data: dict[str, Any]) -> Task:
        depends_on = validated_data.pop("depends_on", [])
        task = super().create(validated_data)
        if depends_on:
            task.depends_on.set(depends_on)
        return task

    def update(self, instance: Task, validated_data: dict[str, Any]) -> Task:
        depends_on = validated_data.pop("depends_on", None)
        task = super().update(instance, validated_data)
        if depends_on is not None:
            task.depends_on.set(depends_on)
        return task


class BoardTaskSerializer(serializers.ModelSerializer):
    """Представление задач для доски."""

    depends_on = serializers.PrimaryKeyRelatedField(read_only=True, many=True)

    class Meta:
        model = Task
        fields = (
            "id",
            "list",
            "title",
            "description",
            "status",
            "assignee",
            "start_at",
            "due_at",
            "order",
            "depends_on",
            "created_at",
            "updated_at",
        )


class BoardListSerializer(serializers.ModelSerializer):
    """Колонка доски с отсортированными задачами."""

    tasks = BoardTaskSerializer(many=True)

    class Meta:
        model = TaskList
        fields = ("id", "event", "title", "order", "created_at", "updated_at", "tasks")


class BoardSerializer(serializers.Serializer):
    """DTO для отдачи доски события."""

    event = serializers.SerializerMethodField()
    lists = BoardListSerializer(many=True)
    is_owner = serializers.SerializerMethodField()

    def get_event(self, obj: dict[str, Any]) -> dict[str, Any]:
        event: Event = obj["event"]
        return {
            "id": event.id,
            "title": event.title,
        }

    def get_is_owner(self, obj: dict[str, Any]) -> bool:
        event: Event = obj["event"]
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return False
        return event.owner_id == user.id
