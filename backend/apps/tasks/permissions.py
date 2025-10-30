from __future__ import annotations

from typing import Any

from django.db.models import Model
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.events.models import Event, Participant
from apps.tasks.models import Task, TaskList


def _extract_event_id(obj: Model) -> int | None:
    if isinstance(obj, TaskList):
        return obj.event_id
    if isinstance(obj, Task):
        return obj.list.event_id
    event_id = getattr(obj, "event_id", None)
    if isinstance(event_id, int):
        return event_id
    list_obj = getattr(obj, "list", None)
    if isinstance(list_obj, TaskList):
        return list_obj.event_id
    return None


def _resolve_event_id_from_view(view: Any, request) -> int | None:
    getter = getattr(view, "get_event_id", None)
    if callable(getter):
        return getter(request)
    return None


class IsEventParticipantReadOnly(BasePermission):
    """Разрешает безопасные запросы участникам события."""

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            event_id = _resolve_event_id_from_view(view, request)
            if event_id is None:
                # Для детальных запросов проверка будет выполнена на объекте.
                return True
            return Participant.objects.filter(user=request.user, event_id=event_id).exists()
        return False

    def has_object_permission(self, request, view, obj: Model) -> bool:
        if request.method not in SAFE_METHODS:
            return False
        event_id = _extract_event_id(obj)
        if event_id is None:
            return False
        return Participant.objects.filter(user=request.user, event_id=event_id).exists()


class IsEventOwnerWrite(BasePermission):
    """Разрешает изменяющие запросы только владельцу события."""

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        event_id = _resolve_event_id_from_view(view, request)
        if event_id is None:
            return False
        return Event.objects.filter(id=event_id, owner=request.user).exists()

    def has_object_permission(self, request, view, obj: Model) -> bool:
        if request.method in SAFE_METHODS:
            return True
        event_id = _extract_event_id(obj)
        if event_id is None:
            return False
        return Event.objects.filter(id=event_id, owner=request.user).exists()


class IsEventOwner(BasePermission):
    """Проверяет, что текущий пользователь является владельцем события."""

    def has_permission(self, request, view) -> bool:
        event_id = _resolve_event_id_from_view(view, request)
        if event_id is None:
            return True
        return Event.objects.filter(id=event_id, owner=request.user).exists()

    def has_object_permission(self, request, view, obj: Model) -> bool:
        event_id = _extract_event_id(obj)
        if event_id is None:
            return False
        return Event.objects.filter(id=event_id, owner=request.user).exists()


class IsTaskAssignee(BasePermission):
    """Разрешает доступ только назначенному ответственному задачи."""

    def has_object_permission(self, request, view, obj: Model) -> bool:
        if isinstance(obj, Task):
            assignee = obj.assignee
            return assignee is not None and assignee.user_id == request.user.id
        return False
