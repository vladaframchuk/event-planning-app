from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.events.models import Event, Participant
from apps.tasks.models import Task, TaskList


def _validate_dependencies_completed(dependencies: list[Task]) -> None:
    """Проверяет, что все переданные задачи находятся в статусе done."""
    incomplete = [task.id for task in dependencies if task.status != Task.Status.DONE]
    if incomplete:
        message = _(
            "Нельзя перевести задачу в статус doing или done, пока зависимости не завершены."
        )
        raise serializers.ValidationError({"status": message})


class TaskListSerializer(serializers.ModelSerializer):
    """Сериализация колонок канбана."""

    class Meta:
        model = TaskList
        fields = ("id", "event", "title", "order", "created_at", "updated_at")
        read_only_fields = ("id", "order", "created_at", "updated_at")


class TaskSerializer(serializers.ModelSerializer):
    """Сериализация задач с проверкой зависимостей и дедлайнов."""

    status = serializers.ChoiceField(
        choices=Task.Status.choices, default=Task.Status.TODO
    )
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=Participant.objects.all(), required=False, allow_null=True
    )
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

    def _resolve_task_list(self, attrs: dict[str, Any]) -> TaskList:
        task_list = attrs.get("list") or getattr(self.instance, "list", None)
        if task_list is None:
            raise serializers.ValidationError({"list": _("Список задач обязателен.")})
        return task_list

    def _resolve_dependencies(self, attrs: dict[str, Any]) -> list[Task]:
        if "depends_on" in attrs:
            depends = attrs.get("depends_on") or []
            return list(depends)
        if self.instance is not None:
            return list(self.instance.depends_on.all())
        return []

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = self.instance
        task_list = self._resolve_task_list(attrs)

        start_at = attrs.get("start_at")
        due_at = attrs.get("due_at")
        if instance:
            start_at = attrs.get("start_at", instance.start_at)
            due_at = attrs.get("due_at", instance.due_at)

        if start_at and due_at and due_at < start_at:
            message = _("Дата дедлайна не может быть раньше даты начала.")
            raise serializers.ValidationError({"due_at": message})

        event_id = task_list.event_id

        depends = attrs.get("depends_on")
        if depends is not None:
            invalid_ids = [
                task.id for task in depends if task.list.event_id != event_id
            ]
            if invalid_ids:
                message = _("Все зависимости должны принадлежать тому же событию.")
                raise serializers.ValidationError({"depends_on": message})

        assignee = attrs.get("assignee")
        if assignee is not None:
            if assignee.event_id != event_id:
                message = _("Ответственный должен принадлежать тому же событию.")
                raise serializers.ValidationError({"assignee": message})

        final_status = attrs.get("status")
        if final_status is None and instance is not None:
            final_status = instance.status

        dependencies = self._resolve_dependencies(attrs)
        if final_status in {Task.Status.DOING, Task.Status.DONE}:
            _validate_dependencies_completed(dependencies)

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


class TaskStatusSerializer(serializers.Serializer):
    """Сериализатор для смены статуса задачи."""

    status = serializers.ChoiceField(choices=Task.Status.choices)

    def validate_status(self, value: str) -> str:
        task: Task = self.context["task"]
        if value in {Task.Status.DOING, Task.Status.DONE}:
            dependencies = list(task.depends_on.all())
            _validate_dependencies_completed(dependencies)
        return value


class TaskAssignSerializer(serializers.Serializer):
    """Сериализатор для назначения ответственного."""

    assignee_participant_id = serializers.IntegerField(allow_null=True)

    def validate_assignee_participant_id(self, value: int | None) -> Participant | None:
        if value is None:
            return None
        try:
            participant = Participant.objects.select_related("user").get(id=value)
        except Participant.DoesNotExist as exc:
            raise serializers.ValidationError(_("Участник не найден.")) from exc
        task: Task = self.context["task"]
        if participant.event_id != task.list.event_id:
            raise serializers.ValidationError(
                _("Участник должен принадлежать тому же событию.")
            )
        return participant

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        participant = attrs.get("assignee_participant_id")
        attrs["participant"] = participant
        return attrs


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
    viewer_role = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()

    def get_event(self, obj: dict[str, Any]) -> dict[str, Any]:
        event: Event = obj["event"]
        return {
            "id": event.id,
            "title": event.title,
        }

    def get_is_owner(self, obj: dict[str, Any]) -> bool:
        return self.get_viewer_role(obj) == Participant.Role.ORGANIZER

    def get_viewer_role(self, obj: dict[str, Any]) -> str | None:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return None
        participants: list[Participant] = obj.get("participants", [])
        for participant in participants:
            if participant.user_id == user.id:
                return participant.role
        event: Event = obj["event"]
        if event.owner_id == user.id:
            return Participant.Role.ORGANIZER
        return None

    def get_participants(self, obj: dict[str, Any]) -> list[dict[str, Any]]:
        participants: list[Participant] = obj.get("participants", [])
        items: list[dict[str, Any]] = []
        for participant in participants:
            user = participant.user
            avatar_url = user.avatar_url
            avatar_field = getattr(user, "avatar", None)
            if not avatar_url and getattr(avatar_field, "name", ""):
                try:
                    avatar_url = avatar_field.url
                except Exception:  # noqa: BLE001
                    avatar_url = None
            items.append(
                {
                    "id": participant.id,
                    "role": participant.role,
                    "user": {
                        "id": user.id,
                        "email": user.email,
                        "name": user.name,
                        "avatar_url": avatar_url,
                    },
                }
            )
        return items
